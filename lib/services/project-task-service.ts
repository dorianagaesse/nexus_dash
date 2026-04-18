import { deleteAttachmentFile } from "@/lib/attachment-storage";
import { sanitizeRichText } from "@/lib/rich-text";
import {
  buildCanonicalTaskRelation,
  mapRelatedTaskSummary,
  normalizeRelatedTaskIds,
  type RelatedTaskSummary,
} from "@/lib/task-related";
import { ATTACHMENT_KIND_FILE } from "@/lib/task-attachment";
import {
  normalizeTaskLabels,
  parseTaskLabelsJson,
  serializeTaskLabels,
} from "@/lib/task-label";
import { isTaskStatus, TASK_STATUSES, type TaskStatus } from "@/lib/task-status";
import {
  parseAttachmentLinksJson,
  validateAttachmentFiles,
} from "@/lib/services/attachment-input-service";
import { logServerError } from "@/lib/observability/logger";
import { createTaskAttachmentsFromDraft } from "@/lib/services/project-attachment-service";
import {
  formatTaskDeadlineDate,
  parseTaskDeadlineDate,
} from "@/lib/task-deadline";
import {
  requireAgentProjectScopes,
  requireProjectRole,
  type AgentProjectAccessContext,
} from "@/lib/services/project-access-service";
import { type DbClient, withActorRlsContext } from "@/lib/services/rls-context";

const MIN_TITLE_LENGTH = 2;

interface ServiceErrorResult {
  ok: false;
  status: number;
  error: string;
}

interface ServiceSuccessResult<T> {
  ok: true;
  data: T;
}

type ServiceResult<T> = ServiceSuccessResult<T> | ServiceErrorResult;

export interface ReorderColumnPayload {
  status: string;
  taskIds: string[];
}

export interface ReorderPayload {
  columns: ReorderColumnPayload[];
}

export interface UpdateTaskPayload {
  title: string;
  label?: string;
  labels?: string[];
  description?: string;
  deadlineDate?: string | null;
  blockedFollowUpEntry?: string;
  relatedTaskIds?: string[];
}

interface CreateTaskForProjectInput {
  actorUserId: string;
  projectId: string;
  title: string;
  description: string;
  deadlineDate: string;
  labelsJsonRaw: string;
  relatedTaskIdsJsonRaw: string;
  attachmentLinksJsonRaw: string;
  attachmentFiles: File[];
  agentAccess?: AgentProjectAccessContext;
}

interface UpdatedTaskPayload {
  id: string;
  title: string;
  label: string | null;
  labelsJson: string | null;
  description: string | null;
  deadlineDate: string | null;
  blockedNote: string | null;
  status: string;
  position: number;
  archivedAt: Date | null;
  relatedTasks: RelatedTaskSummary[];
  blockedFollowUps: {
    id: string;
    content: string;
    createdAt: Date;
  }[];
}

function createError(status: number, error: string): ServiceErrorResult {
  return { ok: false, status, error };
}

function normalizeText(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function parseDeadlineInput(
  value: unknown,
  options?: { preserveWhenMissing?: boolean }
): ServiceResult<{ provided: boolean; deadlineAt: Date | null }> {
  if (value === undefined) {
    if (options?.preserveWhenMissing === true) {
      return {
        ok: true,
        data: {
          provided: false,
          deadlineAt: null,
        },
      };
    }

    return {
      ok: true,
      data: {
        provided: true,
        deadlineAt: null,
      },
    };
  }

  if (value === null) {
    return {
      ok: true,
      data: {
        provided: true,
        deadlineAt: null,
      },
    };
  }

  if (typeof value !== "string") {
    return createError(400, "deadline-invalid");
  }

  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return {
      ok: true,
      data: {
        provided: true,
        deadlineAt: null,
      },
    };
  }

  const parsedDeadline = parseTaskDeadlineDate(normalizedValue);
  if (!parsedDeadline) {
    return createError(400, "deadline-invalid");
  }

  return {
    ok: true,
    data: {
      provided: true,
      deadlineAt: parsedDeadline,
    },
  };
}

function parseRelatedTaskIdsJson(rawValue: string): string[] | null {
  const trimmedValue = rawValue.trim();
  if (!trimmedValue) {
    return [];
  }

  try {
    const parsedValue = JSON.parse(trimmedValue) as unknown;
    if (!Array.isArray(parsedValue)) {
      return null;
    }

    return normalizeRelatedTaskIds(parsedValue);
  } catch {
    return null;
  }
}

const relatedTaskSummarySelect = {
  id: true,
  title: true,
  status: true,
  archivedAt: true,
} as const;

function mergeRelatedTaskSummaries(task: {
  outgoingRelations: { rightTask: { id: string; title: string; status: string; archivedAt: Date | null } }[];
  incomingRelations: { leftTask: { id: string; title: string; status: string; archivedAt: Date | null } }[];
}): RelatedTaskSummary[] {
  const relatedTasks = [
    ...task.outgoingRelations.map((entry) => mapRelatedTaskSummary(entry.rightTask)),
    ...task.incomingRelations.map((entry) => mapRelatedTaskSummary(entry.leftTask)),
  ];

  return relatedTasks.sort((left, right) => left.title.localeCompare(right.title));
}

async function validateRelatedTaskIds(input: {
  db: DbClient;
  projectId: string;
  taskId?: string;
  relatedTaskIds: string[];
  allowArchivedTaskIds?: string[];
}): Promise<ServiceResult<{ relatedTaskIds: string[] }>> {
  const filteredRelatedTaskIds = normalizeRelatedTaskIds(input.relatedTaskIds);
  const allowedArchivedTaskIds = new Set(
    normalizeRelatedTaskIds(input.allowArchivedTaskIds ?? [])
  );

  if (input.taskId && filteredRelatedTaskIds.includes(input.taskId)) {
    return createError(400, "related-tasks-invalid");
  }

  if (filteredRelatedTaskIds.length === 0) {
    return {
      ok: true,
      data: {
        relatedTaskIds: [],
      },
    };
  }

  const relatedTasks = await input.db.task.findMany({
    where: {
      id: { in: filteredRelatedTaskIds },
      projectId: input.projectId,
      OR: [{ archivedAt: null }, { id: { in: Array.from(allowedArchivedTaskIds) } }],
    },
    select: {
      id: true,
    },
  });

  if (relatedTasks.length !== filteredRelatedTaskIds.length) {
    return createError(400, "related-tasks-invalid");
  }

  return {
    ok: true,
    data: {
      relatedTaskIds: filteredRelatedTaskIds,
    },
  };
}

async function replaceTaskRelations(input: {
  db: DbClient;
  projectId: string;
  taskId: string;
  relatedTaskIds: string[];
}) {
  await input.db.taskRelation.deleteMany({
    where: {
      projectId: input.projectId,
      OR: [{ leftTaskId: input.taskId }, { rightTaskId: input.taskId }],
    },
  });

  if (input.relatedTaskIds.length === 0) {
    return;
  }

  await input.db.taskRelation.createMany({
    data: input.relatedTaskIds.map((relatedTaskId) => ({
      ...buildCanonicalTaskRelation(input.taskId, relatedTaskId),
      projectId: input.projectId,
    })),
    skipDuplicates: true,
  });
}

function isPrismaNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  return "code" in error && (error as { code?: string }).code === "P2025";
}

export function isValidReorderPayload(payload: unknown): payload is ReorderPayload {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const maybeColumns = (payload as ReorderPayload).columns;

  if (!Array.isArray(maybeColumns)) {
    return false;
  }

  const seenTaskIds = new Set<string>();

  return maybeColumns.every((column) => {
    if (!column || typeof column !== "object") {
      return false;
    }

    if (typeof column.status !== "string" || !isTaskStatus(column.status)) {
      return false;
    }

    if (!Array.isArray(column.taskIds)) {
      return false;
    }

    return column.taskIds.every((id) => {
      if (typeof id !== "string" || id.length === 0) {
        return false;
      }

      if (seenTaskIds.has(id)) {
        return false;
      }

      seenTaskIds.add(id);
      return true;
    });
  });
}

export async function createTaskForProject(
  input: CreateTaskForProjectInput
): Promise<ServiceResult<{ id: string }>> {
  const actorUserId = normalizeText(input.actorUserId);
  if (!actorUserId) {
    return createError(401, "unauthorized");
  }

  const title = normalizeText(input.title);
  if (title.length < MIN_TITLE_LENGTH) {
    return createError(400, "title-too-short");
  }

  const parsedLinks = parseAttachmentLinksJson(input.attachmentLinksJsonRaw);
  if (parsedLinks.error) {
    return createError(400, parsedLinks.error);
  }

  const parsedRelatedTaskIds = parseRelatedTaskIdsJson(input.relatedTaskIdsJsonRaw);
  if (parsedRelatedTaskIds === null) {
    return createError(400, "related-tasks-invalid");
  }

  const attachmentFileError = validateAttachmentFiles(input.attachmentFiles);
  if (attachmentFileError) {
    return createError(400, attachmentFileError);
  }

  const labels = parseTaskLabelsJson(input.labelsJsonRaw);
  const serializedLabels = serializeTaskLabels(labels);
  const description = sanitizeRichText(normalizeText(input.description));
  const deadlineInput = parseDeadlineInput(input.deadlineDate);
  if (!deadlineInput.ok) {
    return deadlineInput;
  }
  const status = TASK_STATUSES[0];
  const agentScopeAccess = requireAgentProjectScopes({
    agentAccess: input.agentAccess,
    projectId: input.projectId,
    requiredScopes: ["task:write"],
  });
  if (!agentScopeAccess.ok) {
    return createError(agentScopeAccess.status, agentScopeAccess.error);
  }

  let createdTaskId: string | null = null;

  return withActorRlsContext(actorUserId, async (db) => {
    const access = await requireProjectRole({
      actorUserId,
      projectId: input.projectId,
      minimumRole: "editor",
      db,
    });
    if (!access.ok) {
      return createError(access.status, access.error);
    }

    try {
      const relatedTaskValidation = await validateRelatedTaskIds({
        db,
        projectId: input.projectId,
        relatedTaskIds: parsedRelatedTaskIds,
      });
      if (!relatedTaskValidation.ok) {
        return relatedTaskValidation;
      }

      const maxPosition = await db.task.aggregate({
        where: {
          projectId: input.projectId,
          status,
          project: {
            OR: [
              { ownerId: actorUserId },
              { memberships: { some: { userId: actorUserId } } },
            ],
          },
        },
        _max: { position: true },
      });

      const nextPosition = (maxPosition._max.position ?? -1) + 1;

      const createdTask = await db.task.create({
        data: {
          projectId: input.projectId,
          title,
          description,
          deadlineAt: deadlineInput.data.deadlineAt,
          label: labels[0] ?? null,
          labelsJson: serializedLabels,
          status,
          position: nextPosition,
        },
        select: { id: true },
      });

      createdTaskId = createdTask.id;

      await replaceTaskRelations({
        db,
        projectId: input.projectId,
        taskId: createdTask.id,
        relatedTaskIds: relatedTaskValidation.data.relatedTaskIds,
      });

      await createTaskAttachmentsFromDraft({
        actorUserId,
        projectId: input.projectId,
        taskId: createdTask.id,
        links: parsedLinks.links,
        files: input.attachmentFiles,
        db,
      });

      return {
        ok: true,
        data: {
          id: createdTask.id,
        },
      };
    } catch (error) {
      if (createdTaskId) {
        await db.task
          .delete({
            where: { id: createdTaskId },
          })
          .catch((cleanupError) => {
            logServerError("createTaskForProject.cleanup", cleanupError);
          });
      }

      logServerError("createTaskForProject", error);
      return createError(500, "create-failed");
    }
  });
}

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
        select: { id: true, status: true, completedAt: true },
      });

      if (tasks.length !== taskIds.length) {
        return createError(400, "One or more tasks do not belong to this project");
      }

      const taskById = new Map(tasks.map((task) => [task.id, task]));

      const updateOperations = normalizedColumns.flatMap(
        (column: { status: TaskStatus; taskIds: string[] }) =>
          column.taskIds.map((taskId, index) => {
            const existingTask = taskById.get(taskId);
            const movedToDone =
              column.status === "Done" && existingTask?.status !== "Done";

            return db.task.update({
              where: { id: taskId },
              data: {
                status: column.status,
                position: index,
                archivedAt: null,
                completedAt:
                  column.status === "Done"
                    ? movedToDone
                      ? new Date()
                      : existingTask?.completedAt ?? new Date()
                    : null,
              },
            });
          })
      );

      await Promise.all(updateOperations);

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

export async function updateTaskForProject(
  projectId: string,
  taskId: string,
  payload: UpdateTaskPayload,
  actorUserId: string,
  agentAccess?: AgentProjectAccessContext
): Promise<ServiceResult<{ task: UpdatedTaskPayload }>> {
  const normalizedActorUserId = normalizeText(actorUserId);
  if (!normalizedActorUserId) {
    return createError(401, "unauthorized");
  }

  const title = normalizeText(payload.title);
  const rawLabels =
    Array.isArray(payload.labels) && payload.labels.length > 0
      ? payload.labels
      : [normalizeText(payload.label)];
  const labels = rawLabels.map((entry) => normalizeText(entry)).filter(Boolean);
  const normalizedLabels = normalizeTaskLabels(labels);
  const serializedLabels = serializeTaskLabels(normalizedLabels);
  const description = sanitizeRichText(normalizeText(payload.description));
  const deadlineInput = parseDeadlineInput(payload.deadlineDate, {
    preserveWhenMissing: true,
  });
  if (!deadlineInput.ok) {
    return deadlineInput;
  }
  const blockedFollowUpEntry = normalizeText(payload.blockedFollowUpEntry);
  const relatedTaskIds = normalizeRelatedTaskIds(payload.relatedTaskIds ?? []);
  const agentScopeAccess = requireAgentProjectScopes({
    agentAccess,
    projectId,
    requiredScopes: ["task:write"],
  });
  if (!agentScopeAccess.ok) {
    return createError(agentScopeAccess.status, agentScopeAccess.error);
  }

  if (title.length < MIN_TITLE_LENGTH) {
    return createError(400, "Task title must be at least 2 characters");
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
          position: true,
          outgoingRelations: {
            select: {
              rightTaskId: true,
            },
          },
          incomingRelations: {
            select: {
              leftTaskId: true,
            },
          },
        },
      });

      if (!existingTask || existingTask.projectId !== projectId) {
        return createError(404, "Task not found");
      }

      const relatedTaskValidation = await validateRelatedTaskIds({
        db,
        projectId,
        taskId,
        relatedTaskIds,
        allowArchivedTaskIds: [
          ...existingTask.outgoingRelations.map((entry) => entry.rightTaskId),
          ...existingTask.incomingRelations.map((entry) => entry.leftTaskId),
        ],
      });
      if (!relatedTaskValidation.ok) {
        return relatedTaskValidation;
      }

      const updateWithClient = async (tx: typeof db) => {
        await tx.task.update({
          where: { id: taskId },
          data: {
            title,
            label: normalizedLabels[0] ?? null,
            labelsJson: serializedLabels,
            description,
            ...(deadlineInput.data.provided
              ? { deadlineAt: deadlineInput.data.deadlineAt }
              : {}),
          },
        });

        if (blockedFollowUpEntry.length > 0 && existingTask.status === "Blocked") {
          await tx.taskBlockedFollowUp.create({
            data: {
              taskId,
              content: blockedFollowUpEntry,
            },
          });
        }

        await replaceTaskRelations({
          db: tx,
          projectId,
          taskId,
          relatedTaskIds: relatedTaskValidation.data.relatedTaskIds,
        });

        return tx.task.findUnique({
          where: { id: taskId },
          select: {
            id: true,
            title: true,
            label: true,
            labelsJson: true,
            description: true,
            deadlineAt: true,
            blockedNote: true,
            status: true,
            position: true,
            archivedAt: true,
            outgoingRelations: {
              select: {
                rightTask: {
                  select: relatedTaskSummarySelect,
                },
              },
            },
            incomingRelations: {
              select: {
                leftTask: {
                  select: relatedTaskSummarySelect,
                },
              },
            },
            blockedFollowUps: {
              orderBy: [{ createdAt: "desc" }],
              select: {
                id: true,
                content: true,
                createdAt: true,
              },
            },
          },
        });
      };

      const updatedTask = await updateWithClient(db);

      if (!updatedTask) {
        return createError(404, "Task not found");
      }

      return {
        ok: true,
        data: {
          task: {
            id: updatedTask.id,
            title: updatedTask.title,
            label: updatedTask.label,
            labelsJson: updatedTask.labelsJson,
            description: updatedTask.description,
            deadlineDate: formatTaskDeadlineDate(updatedTask.deadlineAt),
            blockedNote: updatedTask.blockedNote,
            status: updatedTask.status,
            position: updatedTask.position,
            archivedAt: updatedTask.archivedAt,
            relatedTasks: mergeRelatedTaskSummaries(updatedTask),
            blockedFollowUps: updatedTask.blockedFollowUps,
          },
        },
      };
    } catch (error) {
      logServerError("updateTaskForProject", error);
      return createError(500, "Failed to update task");
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

      const archivedTask = await db.task.update({
        where: { id: taskId },
        data: {
          archivedAt: new Date(),
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

      await db.task.update({
        where: { id: taskId },
        data: {
          archivedAt: null,
        },
        select: {
          id: true,
        },
      });

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
