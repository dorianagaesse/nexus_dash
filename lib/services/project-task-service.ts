import { deleteAttachmentFile } from "@/lib/attachment-storage";
import { sanitizeRichText } from "@/lib/rich-text";
import {
  buildCanonicalTaskRelation,
  mapRelatedTaskSummary,
  normalizeRelatedTaskIds,
  type RelatedTaskSummary,
} from "@/lib/task-related";
import { mapTaskEpicSummary, type TaskEpicSummary } from "@/lib/epic";
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
import { touchProjectActivity } from "@/lib/services/project-activity-service";
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
import {
  type NotificationActorKind,
  type TaskAssignmentNotificationInput,
  createTaskAssignmentNotification,
  resolveTaskAssignmentNotifications,
} from "@/lib/services/notification-service";
import {
  mapTaskPersonSummary,
  taskPersonSummarySelect,
  type TaskPersonSummary,
} from "@/lib/task-person";
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
  epicId?: string | null;
  assigneeUserId?: string | null;
}

interface CreateTaskForProjectInput {
  actorUserId: string;
  projectId: string;
  title: string;
  description: string;
  deadlineDate: string;
  epicId: string | null;
  assigneeUserId: string | null;
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
  commentCount: number;
  blockedNote: string | null;
  status: string;
  position: number;
  archivedAt: Date | null;
  epic: TaskEpicSummary | null;
  assignee: TaskPersonSummary | null;
  createdBy: TaskPersonSummary;
  updatedBy: TaskPersonSummary;
  createdAt: Date;
  updatedAt: Date;
  relatedTasks: RelatedTaskSummary[];
  blockedFollowUps: {
    id: string;
    content: string;
    createdAt: Date;
  }[];
  attachments: {
    id: string;
    kind: string;
    name: string;
    url: string | null;
    mimeType: string | null;
    sizeBytes: number | null;
  }[];
}

interface PendingTaskAssignmentNotification {
  recipientUserId: string;
  notification: TaskAssignmentNotificationInput;
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

async function loadTaskMutationPayload(
  db: DbClient,
  taskId: string
): Promise<UpdatedTaskPayload | null> {
  const task = await db.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      title: true,
      label: true,
      labelsJson: true,
      description: true,
      deadlineAt: true,
      _count: {
        select: {
          comments: true,
        },
      },
      blockedNote: true,
      status: true,
      position: true,
      archivedAt: true,
      createdAt: true,
      updatedAt: true,
      attachments: {
        orderBy: [{ createdAt: "desc" }],
        select: {
          id: true,
          kind: true,
          name: true,
          url: true,
          mimeType: true,
          sizeBytes: true,
        },
      },
      epic: {
        select: {
          id: true,
          name: true,
        },
      },
      createdByUser: {
        select: taskPersonSummarySelect,
      },
      updatedByUser: {
        select: taskPersonSummarySelect,
      },
      assigneeUser: {
        select: taskPersonSummarySelect,
      },
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

  if (!task) {
    return null;
  }

  return {
    id: task.id,
    title: task.title,
    label: task.label,
    labelsJson: task.labelsJson,
    description: task.description,
    deadlineDate: formatTaskDeadlineDate(task.deadlineAt),
    commentCount: task._count.comments,
    blockedNote: task.blockedNote,
    status: task.status,
    position: task.position,
    archivedAt: task.archivedAt,
    epic: mapTaskEpicSummary(task.epic),
    assignee: task.assigneeUser ? mapTaskPersonSummary(task.assigneeUser) : null,
    createdBy: mapTaskPersonSummary(task.createdByUser)!,
    updatedBy: mapTaskPersonSummary(task.updatedByUser)!,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    relatedTasks: mergeRelatedTaskSummaries(task),
    blockedFollowUps: task.blockedFollowUps,
    attachments: task.attachments,
  };
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

async function validateAssigneeUserId(input: {
  db: DbClient;
  projectId: string;
  assigneeUserId: string | null;
}): Promise<ServiceResult<{ assigneeUserId: string | null }>> {
  const assigneeUserId = normalizeText(input.assigneeUserId);
  if (!assigneeUserId) {
    return {
      ok: true,
      data: {
        assigneeUserId: null,
      },
    };
  }

  const collaborator = await input.db.project.findFirst({
    where: {
      id: input.projectId,
      OR: [
        { ownerId: assigneeUserId },
        { memberships: { some: { userId: assigneeUserId } } },
      ],
    },
    select: {
      id: true,
    },
  });

  if (!collaborator) {
    return createError(400, "assignee-invalid");
  }

  return {
    ok: true,
    data: {
      assigneeUserId,
    },
  };
}

function buildTaskPath(projectId: string, taskId: string): string {
  return `/projects/${encodeURIComponent(projectId)}?taskId=${encodeURIComponent(taskId)}`;
}

function buildPersonDisplayName(input: {
  name: string | null;
  email: string | null;
  username: string | null;
}): string {
  return input.name || input.email || input.username || "Someone";
}

function buildAgentDisplayName(label: string | null | undefined): string {
  const normalizedLabel = normalizeText(label);
  return normalizedLabel ? `${normalizedLabel} (agent)` : "Agent";
}

async function resolveAgentCredentialLabel(input: {
  db: DbClient;
  agentAccess: AgentProjectAccessContext;
}): Promise<string | null> {
  const credential = await input.db.apiCredential.findFirst({
    where: {
      id: input.agentAccess.credentialId,
      projectId: input.agentAccess.projectId,
    },
    select: {
      label: true,
    },
  });

  return normalizeText(credential?.label) || null;
}

function shouldNotifyAssignee(input: {
  actorUserId: string;
  assigneeUserId: string | null;
  agentAccess?: AgentProjectAccessContext;
}): input is {
  actorUserId: string;
  assigneeUserId: string;
  agentAccess?: AgentProjectAccessContext;
} {
  if (!input.assigneeUserId) {
    return false;
  }

  return Boolean(input.agentAccess) || input.assigneeUserId !== input.actorUserId;
}

async function buildTaskAssignmentNotification(input: {
  db: DbClient;
  projectId: string;
  taskId: string;
  actorUserId: string;
  assigneeUserId: string;
  agentAccess?: AgentProjectAccessContext;
}): Promise<PendingTaskAssignmentNotification | null> {
  const task = await input.db.task.findUnique({
    where: { id: input.taskId },
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

  if (
    !task ||
    task.projectId !== input.projectId ||
    !task.assigneeUser ||
    task.assigneeUser.id !== input.assigneeUserId
  ) {
    return null;
  }

  let actorKind: NotificationActorKind = "user";
  let actorDisplayName = buildPersonDisplayName(task.updatedByUser);
  let actorCredentialId: string | null = null;
  let actorCredentialLabel: string | null = null;

  if (input.agentAccess) {
    actorKind = "agent";
    actorCredentialId = input.agentAccess.credentialId;
    actorCredentialLabel = await resolveAgentCredentialLabel({
      db: input.db,
      agentAccess: input.agentAccess,
    });
    actorDisplayName = buildAgentDisplayName(actorCredentialLabel);
  }

  return {
    recipientUserId: task.assigneeUser.id,
    notification: {
      taskId: task.id,
      taskTitle: task.title,
      projectId: task.projectId,
      projectName: task.project.name,
      assignedUserId: task.assigneeUser.id,
      assignedUserDisplayName: buildPersonDisplayName(task.assigneeUser),
      actorKind,
      actorUserId: input.actorUserId,
      actorDisplayName,
      actorCredentialId,
      actorCredentialLabel,
      targetPath: buildTaskPath(task.projectId, task.id),
    },
  };
}

async function dispatchTaskAssignmentNotification(input: {
  db: DbClient;
  pendingNotification: PendingTaskAssignmentNotification | null;
}): Promise<void> {
  if (!input.pendingNotification) {
    return;
  }

  await createTaskAssignmentNotification({
    db: input.db,
    ...input.pendingNotification,
  });
}

async function validateEpicId(input: {
  db: DbClient;
  projectId: string;
  epicId: string | null;
}): Promise<ServiceResult<{ epicId: string | null }>> {
  const epicId = normalizeText(input.epicId);
  if (!epicId) {
    return {
      ok: true,
      data: {
        epicId: null,
      },
    };
  }

  const epic = await input.db.epic.findFirst({
    where: {
      id: epicId,
      projectId: input.projectId,
    },
    select: {
      id: true,
    },
  });

  if (!epic) {
    return createError(400, "epic-invalid");
  }

  return {
    ok: true,
    data: {
      epicId,
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
): Promise<ServiceResult<{ task: UpdatedTaskPayload }>> {
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

      const assigneeValidation = await validateAssigneeUserId({
        db,
        projectId: input.projectId,
        assigneeUserId: input.assigneeUserId,
      });
      if (!assigneeValidation.ok) {
        return assigneeValidation;
      }

      const epicValidation = await validateEpicId({
        db,
        projectId: input.projectId,
        epicId: input.epicId,
      });
      if (!epicValidation.ok) {
        return epicValidation;
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
          epicId: epicValidation.data.epicId,
          label: labels[0] ?? null,
          labelsJson: serializedLabels,
          status,
          position: nextPosition,
          createdByUserId: actorUserId,
          updatedByUserId: actorUserId,
          assigneeUserId: assigneeValidation.data.assigneeUserId,
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

      const createdAssigneeUserId = assigneeValidation.data.assigneeUserId;
      if (
        createdAssigneeUserId &&
        shouldNotifyAssignee({
          actorUserId,
          assigneeUserId: createdAssigneeUserId,
          agentAccess: input.agentAccess,
        })
      ) {
        await dispatchTaskAssignmentNotification({
          db,
          pendingNotification: await buildTaskAssignmentNotification({
            db,
            projectId: input.projectId,
            taskId: createdTask.id,
            actorUserId,
            assigneeUserId: createdAssigneeUserId,
            agentAccess: input.agentAccess,
          }),
        });
      }

      await touchProjectActivity({ db, projectId: input.projectId });

      const task = await loadTaskMutationPayload(db, createdTask.id);
      if (!task) {
        return createError(500, "create-failed");
      }

      return {
        ok: true,
        data: {
          task,
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

  const titleProvided = Object.prototype.hasOwnProperty.call(payload, "title");
  const title = normalizeText(payload.title);
  const labelsProvided =
    Object.prototype.hasOwnProperty.call(payload, "labels") ||
    Object.prototype.hasOwnProperty.call(payload, "label");
  const rawLabels =
    Array.isArray(payload.labels) && payload.labels.length > 0
      ? payload.labels
      : [normalizeText(payload.label)];
  const labels = rawLabels.map((entry) => normalizeText(entry)).filter(Boolean);
  const normalizedLabels = normalizeTaskLabels(labels);
  const serializedLabels = serializeTaskLabels(normalizedLabels);
  const descriptionProvided = Object.prototype.hasOwnProperty.call(payload, "description");
  const description = sanitizeRichText(normalizeText(payload.description));
  const deadlineInput = parseDeadlineInput(payload.deadlineDate, {
    preserveWhenMissing: true,
  });
  if (!deadlineInput.ok) {
    return deadlineInput;
  }
  const blockedFollowUpEntry = normalizeText(payload.blockedFollowUpEntry);
  const relatedTaskIdsProvided = Object.prototype.hasOwnProperty.call(payload, "relatedTaskIds");
  const relatedTaskIds = relatedTaskIdsProvided
    ? normalizeRelatedTaskIds(payload.relatedTaskIds ?? [])
    : [];
  const epicProvided = Object.prototype.hasOwnProperty.call(payload, "epicId");
  const epicId = epicProvided ? normalizeText(payload.epicId) : null;
  const assigneeProvided = Object.prototype.hasOwnProperty.call(payload, "assigneeUserId");
  const assigneeUserId = assigneeProvided
    ? normalizeText(payload.assigneeUserId)
    : null;
  const agentScopeAccess = requireAgentProjectScopes({
    agentAccess,
    projectId,
    requiredScopes: ["task:write"],
  });
  if (!agentScopeAccess.ok) {
    return createError(agentScopeAccess.status, agentScopeAccess.error);
  }

  if (titleProvided && title.length < MIN_TITLE_LENGTH) {
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
          epicId: true,
          assigneeUserId: true,
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

      const relatedTaskValidation = relatedTaskIdsProvided
        ? await validateRelatedTaskIds({
            db,
            projectId,
            taskId,
            relatedTaskIds,
            allowArchivedTaskIds: [
              ...existingTask.outgoingRelations.map((entry) => entry.rightTaskId),
              ...existingTask.incomingRelations.map((entry) => entry.leftTaskId),
            ],
          })
        : {
            ok: true as const,
            data: {
              relatedTaskIds: [
                ...existingTask.outgoingRelations.map((entry) => entry.rightTaskId),
                ...existingTask.incomingRelations.map((entry) => entry.leftTaskId),
              ],
            },
          };
      if (!relatedTaskValidation.ok) {
        return relatedTaskValidation;
      }

      const epicValidation = epicProvided
        ? await validateEpicId({
            db,
            projectId,
            epicId: epicId || null,
          })
        : {
            ok: true as const,
            data: {
              epicId: existingTask.epicId,
            },
          };
      if (!epicValidation.ok) {
        return epicValidation;
      }

      const assigneeValidation = assigneeProvided
        ? await validateAssigneeUserId({
            db,
            projectId,
            assigneeUserId: assigneeUserId || null,
          })
        : {
            ok: true as const,
            data: {
              assigneeUserId: existingTask.assigneeUserId,
            },
          };
      if (!assigneeValidation.ok) {
        return assigneeValidation;
      }

      const updateWithClient = async (tx: typeof db) => {
        await tx.task.update({
          where: { id: taskId },
          data: {
            updatedByUserId: normalizedActorUserId,
            epicId: epicValidation.data.epicId,
            assigneeUserId: assigneeValidation.data.assigneeUserId,
            ...(titleProvided ? { title } : {}),
            ...(labelsProvided
              ? {
                  label: normalizedLabels[0] ?? null,
                  labelsJson: serializedLabels,
                }
              : {}),
            ...(descriptionProvided ? { description } : {}),
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

        if (relatedTaskIdsProvided) {
          await replaceTaskRelations({
            db: tx,
            projectId,
            taskId,
            relatedTaskIds: relatedTaskValidation.data.relatedTaskIds,
          });
        }

        return loadTaskMutationPayload(tx, taskId);
      };

      const updatedTask = await updateWithClient(db);

      if (!updatedTask) {
        return createError(404, "Task not found");
      }

      const updatedAssigneeUserId = assigneeValidation.data.assigneeUserId;
      if (
        assigneeProvided &&
        existingTask.assigneeUserId &&
        existingTask.assigneeUserId !== updatedAssigneeUserId
      ) {
        await resolveTaskAssignmentNotifications({
          db,
          taskIds: [taskId],
          recipientUserId: existingTask.assigneeUserId,
        });
      }

      if (
        assigneeProvided &&
        existingTask.assigneeUserId !== updatedAssigneeUserId &&
        updatedAssigneeUserId &&
        shouldNotifyAssignee({
          actorUserId: normalizedActorUserId,
          assigneeUserId: updatedAssigneeUserId,
          agentAccess,
        })
      ) {
        await dispatchTaskAssignmentNotification({
          db,
          pendingNotification: await buildTaskAssignmentNotification({
            db,
            projectId,
            taskId,
            actorUserId: normalizedActorUserId,
            assigneeUserId: updatedAssigneeUserId,
            agentAccess,
          }),
        });
      }

      await touchProjectActivity({ db, projectId });

      return {
        ok: true,
        data: {
          task: updatedTask,
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
          updatedByUserId: normalizedActorUserId,
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

      await db.task.update({
        where: { id: taskId },
        data: {
          archivedAt: null,
          updatedByUserId: normalizedActorUserId,
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
