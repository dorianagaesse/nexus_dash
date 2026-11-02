import { deleteAttachmentFile } from "@/lib/attachment-storage";
import { ATTACHMENT_KIND_FILE } from "@/lib/task-attachment";
import { TASK_STATUSES, type TaskStatus } from "@/lib/task-status";
import { logServerError } from "@/lib/observability/logger";
import { touchProjectActivity } from "@/lib/services/project-activity-service";
import {
  requireAgentProjectScopes,
  requireProjectRole,
  type AgentProjectAccessContext,
} from "@/lib/services/project-access-service";
import { withActorRlsContext } from "@/lib/services/rls-context";
import type { ReorderPayload, TaskStatusTransitionPayload } from "@/lib/task-contracts";
import type { ServiceResult, UpdatedTaskPayload } from "./task-types";
import { createError, isPrismaNotFoundError } from "./task-result";
import { normalizeText } from "./task-input";
import { requireAgentDoneMoveCapability } from "./task-policy";
import { resolveTaskAgentAttribution, taskAgentAuthorWriteData } from "./task-assignment";
import { loadTaskMutationPayload, shiftTaskLanePositions, compactTaskSourceLane } from "./task-persistence";

export async function reorderProjectTasks(
  projectId: string,
  payload: ReorderPayload,
  actorUserId: string,
  agentAccess?: AgentProjectAccessContext
): Promise<ServiceResult<{ ok: true }>> {
  const normalizedActorUserId = normalizeText(actorUserId);
  if (!normalizedActorUserId) {
    return createError(401, "unauthorized");
  }

  const normalizedColumns = TASK_STATUSES.map((status) => {
    const matchingColumn = payload.columns.find((column) => column.status === status);
    return {
      status,
      taskIds: matchingColumn ? matchingColumn.taskIds : [],
    };
  });

  const taskIds = normalizedColumns.flatMap((column) => column.taskIds);
  const agentScopeAccess = requireAgentProjectScopes({
    agentAccess,
    projectId,
    requiredScopes: ["task:write"],
  });
  if (!agentScopeAccess.ok) {
    return createError(agentScopeAccess.status, agentScopeAccess.error);
  }

  if (taskIds.length === 0) {
    return {
      ok: true,
      data: { ok: true },
    };
  }

  return withActorRlsContext(normalizedActorUserId, async (db) => {
    const access = await requireProjectRole({
      actorUserId: normalizedActorUserId,
      projectId,
      minimumRole: "editor",
      db,
    });
    if (!access.ok) {
      return createError(access.status, access.error);
    }

    try {
      const tasks = await db.task.findMany({
        where: {
          projectId,
          id: { in: taskIds },
          project: {
            OR: [
              { ownerId: normalizedActorUserId },
              { memberships: { some: { userId: normalizedActorUserId } } },
            ],
          },
        },
        select: {
          id: true,
          status: true,
          position: true,
          archivedAt: true,
          completedAt: true,
        },
      });

      if (tasks.length !== taskIds.length) {
        return createError(400, "One or more tasks do not belong to this project");
      }

      const taskById = new Map(tasks.map((task) => [task.id, task]));

      const movesToDone = normalizedColumns.some((column) =>
        column.status === "Done" && column.taskIds.some((id) => taskById.get(id)?.status !== "Done")
      );
      if (movesToDone) {
        const denied = await requireAgentDoneMoveCapability(db, projectId, agentAccess);
        if (denied) return denied;
      }

      const agentAttribution = await resolveTaskAgentAttribution({
        db,
        agentAccess,
      });
      const agentAuthorData = taskAgentAuthorWriteData(
        agentAttribution,
        "updatedBy"
      );

      const now = new Date();
      const updateOperations = normalizedColumns.flatMap(
        (column: { status: TaskStatus; taskIds: string[] }) =>
          column.taskIds.flatMap((taskId, index) => {
            const existingTask = taskById.get(taskId);
            const movedToDone =
              column.status === "Done" && existingTask?.status !== "Done";
            const nextCompletedAt =
              column.status === "Done"
                ? movedToDone
                  ? now
                  : existingTask?.completedAt ?? now
                : null;

            if (
              existingTask &&
              existingTask.status === column.status &&
              existingTask.position === index &&
              existingTask.archivedAt === null &&
              ((existingTask.completedAt === null && nextCompletedAt === null) ||
                existingTask.completedAt?.getTime() === nextCompletedAt?.getTime())
            ) {
              return [];
            }

            return [
              db.task.update({
                where: { id: taskId },
                data: {
                  status: column.status,
                  position: index,
                  archivedAt: null,
                  updatedByUserId: normalizedActorUserId,
                  ...agentAuthorData,
                  completedAt: nextCompletedAt,
                },
              }),
            ];
          })
      );

      await Promise.all(updateOperations);
      if (updateOperations.length > 0) {
        await touchProjectActivity({ db, projectId });
      }

      return {
        ok: true,
        data: { ok: true },
      };
    } catch (error) {
      logServerError("reorderProjectTasks", error);
      return createError(500, "Failed to persist task order");
    }
  });
}

export async function moveTaskStatusForProject(
  projectId: string,
  taskId: string,
  payload: TaskStatusTransitionPayload,
  actorUserId: string,
  agentAccess?: AgentProjectAccessContext
): Promise<ServiceResult<{ task: UpdatedTaskPayload }>> {
  const normalizedActorUserId = normalizeText(actorUserId);
  if (!normalizedActorUserId) {
    return createError(401, "unauthorized");
  }

  const agentScopeAccess = requireAgentProjectScopes({
    agentAccess,
    projectId,
    requiredScopes: ["task:write"],
  });
  if (!agentScopeAccess.ok) {
    return createError(agentScopeAccess.status, agentScopeAccess.error);
  }

  const targetStatus = payload.status;

  return withActorRlsContext(normalizedActorUserId, async (db) => {
    const access = await requireProjectRole({
      actorUserId: normalizedActorUserId,
      projectId,
      minimumRole: "editor",
      db,
    });
    if (!access.ok) {
      return createError(access.status, access.error);
    }

    try {
      const existingTask = await db.task.findUnique({
        where: { id: taskId },
        select: {
          id: true,
          projectId: true,
          status: true,
          position: true,
          archivedAt: true,
          completedAt: true,
        },
      });

      if (!existingTask || existingTask.projectId !== projectId) {
        return createError(404, "Task not found");
      }

      if (targetStatus === "Done" && existingTask.status !== "Done") {
        const denied = await requireAgentDoneMoveCapability(db, projectId, agentAccess);
        if (denied) return denied;
      }

      const sameColumn = existingTask.status === targetStatus;
      const destinationTasks = await db.task.findMany({
        where: {
          projectId,
          status: targetStatus,
          ...(sameColumn ? { NOT: { id: taskId } } : {}),
          project: {
            OR: [
              { ownerId: normalizedActorUserId },
              { memberships: { some: { userId: normalizedActorUserId } } },
            ],
          },
        },
        select: { id: true, position: true },
        orderBy: [{ position: "asc" }],
      });

      const destinationCount = destinationTasks.length;
      const rawPosition =
        payload.position ?? (sameColumn ? existingTask.position : destinationCount);
      const finalPosition = Math.min(Math.max(rawPosition, 0), destinationCount);

      const now = new Date();
      const movedToDone = targetStatus === "Done" && existingTask.status !== "Done";
      const nextCompletedAt =
        targetStatus === "Done"
          ? movedToDone
            ? now
            : existingTask.completedAt ?? now
          : null;

      const completedAtUnchanged =
        (existingTask.completedAt === null && nextCompletedAt === null) ||
        existingTask.completedAt?.getTime() === nextCompletedAt?.getTime();

      if (
        sameColumn &&
        finalPosition === existingTask.position &&
        existingTask.archivedAt === null &&
        completedAtUnchanged
      ) {
        const task = await loadTaskMutationPayload(db, projectId, taskId);
        if (!task) {
          return createError(404, "Task not found");
        }
        return { ok: true, data: { task } };
      }

      await shiftTaskLanePositions(db, {
        projectId,
        sourceStatus: existingTask.status,
        sourcePosition: existingTask.position,
        targetStatus,
        targetPosition: finalPosition,
        destinationTasks,
      });

      const agentAttribution = await resolveTaskAgentAttribution({
        db,
        agentAccess,
      });

      await db.task.update({
        where: { id: taskId },
        data: {
          status: targetStatus,
          position: finalPosition,
          archivedAt: null,
          updatedByUserId: normalizedActorUserId,
          ...taskAgentAuthorWriteData(agentAttribution, "updatedBy"),
          completedAt: nextCompletedAt,
        },
      });

      if (!sameColumn) {
        await compactTaskSourceLane(db, projectId, existingTask.status, existingTask.position);
      }

      await touchProjectActivity({ db, projectId });

      const task = await loadTaskMutationPayload(db, projectId, taskId);
      if (!task) {
        return createError(500, "Failed to move task");
      }

      return { ok: true, data: { task } };
    } catch (error) {
      logServerError("moveTaskStatusForProject", error);
      return createError(500, "Failed to move task");
    }
  });
}

export async function archiveTaskForProject(
  projectId: string,
  taskId: string,
  actorUserId: string,
  agentAccess?: AgentProjectAccessContext
): Promise<ServiceResult<{ archivedAt: Date }>> {
  const normalizedActorUserId = normalizeText(actorUserId);
  if (!normalizedActorUserId) {
    return createError(401, "unauthorized");
  }

  const agentScopeAccess = requireAgentProjectScopes({
    agentAccess,
    projectId,
    requiredScopes: ["task:write"],
  });
  if (!agentScopeAccess.ok) {
    return createError(agentScopeAccess.status, agentScopeAccess.error);
  }

  return withActorRlsContext(normalizedActorUserId, async (db) => {
    const access = await requireProjectRole({
      actorUserId: normalizedActorUserId,
      projectId,
      minimumRole: "editor",
      db,
    });
    if (!access.ok) {
      return createError(access.status, access.error);
    }

    try {
      const existingTask = await db.task.findUnique({
        where: { id: taskId },
        select: {
          id: true,
          projectId: true,
          status: true,
          archivedAt: true,
        },
      });

      if (!existingTask || existingTask.projectId !== projectId) {
        return createError(404, "Task not found");
      }

      if (existingTask.status !== "Done") {
        return createError(400, "Only done tasks can be archived");
      }

      if (existingTask.archivedAt) {
        return {
          ok: true,
          data: {
            archivedAt: existingTask.archivedAt,
          },
        };
      }

      const agentAttribution = await resolveTaskAgentAttribution({
        db,
        agentAccess,
      });

      const archivedTask = await db.task.update({
        where: { id: taskId },
        data: {
          archivedAt: new Date(),
          updatedByUserId: normalizedActorUserId,
          ...taskAgentAuthorWriteData(agentAttribution, "updatedBy"),
        },
        select: {
          archivedAt: true,
        },
      });

      if (!archivedTask.archivedAt) {
        logServerError(
          "archiveTaskForProject",
          new Error("Task archivedAt is null after update")
        );
        return createError(500, "Failed to archive task");
      }

      await touchProjectActivity({ db, projectId });

      return {
        ok: true,
        data: {
          archivedAt: archivedTask.archivedAt,
        },
      };
    } catch (error) {
      if (isPrismaNotFoundError(error)) {
        return createError(404, "Task not found");
      }

      logServerError("archiveTaskForProject", error);
      return createError(500, "Failed to archive task");
    }
  });
}

export async function unarchiveTaskForProject(
  projectId: string,
  taskId: string,
  actorUserId: string,
  agentAccess?: AgentProjectAccessContext
): Promise<ServiceResult<{ ok: true }>> {
  const normalizedActorUserId = normalizeText(actorUserId);
  if (!normalizedActorUserId) {
    return createError(401, "unauthorized");
  }

  const agentScopeAccess = requireAgentProjectScopes({
    agentAccess,
    projectId,
    requiredScopes: ["task:write"],
  });
  if (!agentScopeAccess.ok) {
    return createError(agentScopeAccess.status, agentScopeAccess.error);
  }

  return withActorRlsContext(normalizedActorUserId, async (db) => {
    const access = await requireProjectRole({
      actorUserId: normalizedActorUserId,
      projectId,
      minimumRole: "editor",
      db,
    });
    if (!access.ok) {
      return createError(access.status, access.error);
    }

    try {
      const existingTask = await db.task.findUnique({
        where: { id: taskId },
        select: {
          id: true,
          projectId: true,
          status: true,
          archivedAt: true,
        },
      });

      if (!existingTask || existingTask.projectId !== projectId) {
        return createError(404, "Task not found");
      }

      if (existingTask.status !== "Done") {
        return createError(400, "Only done tasks can be unarchived");
      }

      if (!existingTask.archivedAt) {
        return {
          ok: true,
          data: { ok: true },
        };
      }

      const agentAttribution = await resolveTaskAgentAttribution({
        db,
        agentAccess,
      });

      await db.task.update({
        where: { id: taskId },
        data: {
          archivedAt: null,
          updatedByUserId: normalizedActorUserId,
          ...taskAgentAuthorWriteData(agentAttribution, "updatedBy"),
        },
        select: {
          id: true,
        },
      });

      await touchProjectActivity({ db, projectId });

      return {
        ok: true,
        data: { ok: true },
      };
    } catch (error) {
      if (isPrismaNotFoundError(error)) {
        return createError(404, "Task not found");
      }

      logServerError("unarchiveTaskForProject", error);
      return createError(500, "Failed to unarchive task");
    }
  });
}

export async function deleteTaskForProject(
  projectId: string,
  taskId: string,
  actorUserId: string,
  agentAccess?: AgentProjectAccessContext
): Promise<ServiceResult<{ ok: true }>> {
  const normalizedActorUserId = normalizeText(actorUserId);
  if (!normalizedActorUserId) {
    return createError(401, "unauthorized");
  }

  const agentScopeAccess = requireAgentProjectScopes({
    agentAccess,
    projectId,
    requiredScopes: ["task:delete"],
  });
  if (!agentScopeAccess.ok) {
    return createError(agentScopeAccess.status, agentScopeAccess.error);
  }

  return withActorRlsContext(normalizedActorUserId, async (db) => {
    const access = await requireProjectRole({
      actorUserId: normalizedActorUserId,
      projectId,
      minimumRole: "owner",
      db,
    });
    if (!access.ok) {
      return createError(access.status, access.error);
    }

    try {
      const existingTask = await db.task.findUnique({
        where: { id: taskId },
        select: {
          id: true,
          projectId: true,
          attachments: {
            where: {
              kind: ATTACHMENT_KIND_FILE,
              NOT: { storageKey: null },
            },
            select: { storageKey: true },
          },
        },
      });

      if (!existingTask || existingTask.projectId !== projectId) {
        return createError(404, "Task not found");
      }

      const storageKeys = existingTask.attachments
        .map((attachment) => attachment.storageKey)
        .filter((storageKey): storageKey is string => Boolean(storageKey));

      await db.task.delete({
        where: { id: taskId },
      });

      await Promise.all(
        storageKeys.map((storageKey) =>
          deleteAttachmentFile(storageKey).catch((cleanupError) => {
            logServerError("deleteTaskForProject.cleanup", cleanupError);
          })
        )
      );

      await touchProjectActivity({ db, projectId });

      return {
        ok: true,
        data: { ok: true },
      };
    } catch (error) {
      if (isPrismaNotFoundError(error)) {
        return createError(404, "Task not found");
      }

      logServerError("deleteTaskForProject", error);
      return createError(500, "Failed to delete task");
    }
  });
}
