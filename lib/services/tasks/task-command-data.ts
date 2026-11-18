import type { DbClient } from "@/lib/services/rls-context";
import { ATTACHMENT_KIND_FILE } from "@/lib/task-attachment";
import { buildProjectPrincipalWhere } from "@/lib/services/project-access-service";
import { taskPersonSummarySelect } from "@/lib/task-person";

// Caller authorizes the project and keeps these reads on its actor-scoped client.
// Unique-id reads retain projectId for the caller's existing project checks.
export async function loadTaskLaneTail(db: DbClient, projectId: string, status: string, actorUserId: string) {
  const result = await db.task.aggregate({
    where: {
      projectId,
      status,
      project: buildProjectPrincipalWhere(actorUserId),
    },
    _max: { position: true },
  });
  return result._max.position;
}

export function loadTaskEditState(db: DbClient, taskId: string, loadExistingRelations: boolean) {
  return db.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      projectId: true,
      status: true,
      position: true,
      epicId: true,
      assigneeKind: true,
      assigneeUserId: true,
      assigneeCredentialId: true,
      assigneeDisplayNameSnapshot: true,
      outgoingRelations: loadExistingRelations
        ? { select: { rightTaskId: true } }
        : false,
      incomingRelations: loadExistingRelations
        ? { select: { leftTaskId: true } }
        : false,
    },
  });
}

export function loadTasksForReorder(db: DbClient, projectId: string, taskIds: string[], actorUserId: string) {
  return db.task.findMany({
    where: {
      projectId,
      id: { in: taskIds },
      project: buildProjectPrincipalWhere(actorUserId),
    },
    select: {
      id: true,
      status: true,
      position: true,
      archivedAt: true,
      completedAt: true,
    },
  });
}

export function loadTaskLaneState(db: DbClient, taskId: string) {
  return db.task.findUnique({
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
}

export function loadTaskDestinationLane(db: DbClient, input: {
  projectId: string;
  targetStatus: string;
  taskId: string;
  sameColumn: boolean;
  actorUserId: string;
}) {
  return db.task.findMany({
    where: {
      projectId: input.projectId,
      status: input.targetStatus,
      ...(input.sameColumn ? { NOT: { id: input.taskId } } : {}),
      project: buildProjectPrincipalWhere(input.actorUserId),
    },
    select: { id: true, position: true },
    orderBy: [{ position: "asc" }],
  });
}

export function loadTaskArchiveState(db: DbClient, taskId: string) {
  return db.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      projectId: true,
      status: true,
      archivedAt: true,
    },
  });
}

export function loadTaskDeletionFiles(db: DbClient, taskId: string) {
  return db.task.findUnique({
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
}

export function loadAllowedRelatedTasks(db: DbClient, input: {
  projectId: string;
  taskIds: string[];
  allowedArchivedTaskIds: string[];
}) {
  return db.task.findMany({
    where: {
      id: { in: input.taskIds },
      projectId: input.projectId,
      OR: [{ archivedAt: null }, { id: { in: input.allowedArchivedTaskIds } }],
    },
    select: {
      id: true,
    },
  });
}

export async function loadTaskRelationDiagnostic(db: DbClient, taskId: string, projectId?: string) {
  const candidates = await db.task.findMany({
    where: {
      id: taskId,
      ...(projectId !== undefined ? { projectId } : {}),
    },
    select: { id: true, projectId: true, archivedAt: true },
  });
  return candidates[0] ?? null;
}

export function loadTaskAssignmentContext(db: DbClient, taskId: string) {
  return db.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      title: true,
      projectId: true,
      project: {
        select: {
          name: true,
        },
      },
      assigneeUser: {
        select: taskPersonSummarySelect,
      },
      updatedByUser: {
        select: taskPersonSummarySelect,
      },
    },
  });
}
