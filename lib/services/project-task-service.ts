import { deleteAttachmentFile } from "@/lib/attachment-storage";
import { sanitizeRichText } from "@/lib/rich-text";
import {
  buildCanonicalTaskRelation,
  mergeRelatedTaskSummaries,
  normalizeRelatedTaskIds,
  type RelatedTaskSummary,
} from "@/lib/task-related";
import { mapTaskEpicSummary, type TaskEpicSummary } from "@/lib/epic";
import { ATTACHMENT_KIND_FILE } from "@/lib/task-attachment";
import {
  getTaskLabelsFromStorage,
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
import { formatTaskReference } from "@/lib/task-reference";
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
import { taskPersonSummarySelect } from "@/lib/task-person";
import { mapTaskAuthorRecord, type TaskAuthorSummary } from "@/lib/task-author";
import { type DbClient, withActorRlsContext } from "@/lib/services/rls-context";
import { MAX_TASK_TITLE_LENGTH } from "@/lib/task-title";
import {
  isProjectActorReference,
  type ProjectActorKind,
  type ProjectActorReference,
  type ProjectActorSummary,
} from "@/lib/project-actor";
import {
  loadProjectActorRegistry,
  resolveAssignableProjectActorFromRegistry,
  resolveProjectMutationActor,
  type ResolvedProjectActorPersistence,
} from "@/lib/services/project-actor-service";
import { mapTaskStoredActor } from "@/lib/services/project-task-response";

const MIN_TITLE_LENGTH = 2;
const TASK_ASSIGNEE_INVALID = "assignee-invalid";

export { MAX_BULK_TASK_OPERATIONS } from "@/lib/task-bulk";

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
  assignee?: ProjectActorReference | null;
  assigneeUserId?: string | null;
  attachmentLinks?: unknown;
}

export interface CreateTaskForProjectInput {
  actorUserId: string;
  projectId: string;
  title: string;
  description: string;
  deadlineDate: string;
  epicId: string | null;
  assignee: ProjectActorReference | null;
  labelsJsonRaw: string;
  relatedTaskIdsJsonRaw: string;
  attachmentLinksJsonRaw: string;
  attachmentFiles: File[];
  agentAccess?: AgentProjectAccessContext;
}

export interface UpdatedTaskPayload {
  id: string;
  reference: string;
  title: string;
  label: string | null;
  labelsJson: string | null;
  labels: string[];
  description: string | null;
  deadlineDate: string | null;
  commentCount: number;
  blockedNote: string | null;
  status: string;
  position: number;
  completedAt: Date | null;
  archivedAt: Date | null;
  epic: TaskEpicSummary | null;
  assignee: ProjectActorSummary | null;
  assignedBy: ProjectActorSummary | null;
  assignedAt: Date | null;
  createdBy: TaskAuthorSummary;
  updatedBy: TaskAuthorSummary;
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

function serializeJsonFieldValue(value: unknown): string {
  if (value == null) {
    return "";
  }
  if (typeof value === "string") {
    return value.trim();
  }
  return JSON.stringify(value);
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

export function validateTaskCreateFieldTypes(payload: {
  deadlineDate?: unknown;
  epicId?: unknown;
  assigneeUserId?: unknown;
  assignee?: unknown;
}): string | null {
  if (
    payload.deadlineDate !== undefined &&
    payload.deadlineDate !== null &&
    typeof payload.deadlineDate !== "string"
  ) {
    return "deadline-invalid";
  }
  if (
    payload.epicId !== undefined &&
    payload.epicId !== null &&
    typeof payload.epicId !== "string"
  ) {
    return "epic-invalid";
  }
  if (
    payload.assigneeUserId !== undefined &&
    payload.assigneeUserId !== null &&
    typeof payload.assigneeUserId !== "string"
  ) {
    return TASK_ASSIGNEE_INVALID;
  }
  if (
    payload.assignee !== undefined &&
    payload.assignee !== null &&
    !isProjectActorReference(payload.assignee)
  ) {
    return TASK_ASSIGNEE_INVALID;
  }
  return null;
}

// Create transports may send the structured assignee reference (which wins)
// or the legacy human shorthand; callers reject malformed shape through
// validateTaskCreateFieldTypes before calling this. An explicit structured
// null means "no assignee" and suppresses the legacy fallback, matching the
// update transport's precedence.
export function parseTaskAssigneeInput(payload: {
  assignee?: unknown;
  assigneeUserId?: unknown;
}): ProjectActorReference | null {
  if (payload.assignee === null) {
    return null;
  }

  if (payload.assignee === undefined) {
    if (typeof payload.assigneeUserId === "string") {
      const legacyAssigneeUserId = payload.assigneeUserId.trim();
      return legacyAssigneeUserId
        ? { kind: "human", id: legacyAssigneeUserId }
        : null;
    }
    return null;
  }

  if (isProjectActorReference(payload.assignee)) {
    return {
      kind: payload.assignee.kind,
      id: payload.assignee.id.trim(),
    };
  }

  return null;
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

async function loadTaskMutationPayload(
  db: DbClient,
  projectId: string,
  taskId: string
): Promise<UpdatedTaskPayload | null> {
  const task = await db.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      referenceNumber: true,
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
      completedAt: true,
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
      createdByCredentialId: true,
      createdByCredentialLabel: true,
      updatedByCredentialId: true,
      updatedByCredentialLabel: true,
      createdByUser: {
        select: taskPersonSummarySelect,
      },
      updatedByUser: {
        select: taskPersonSummarySelect,
      },
      assigneeKind: true,
      assigneeUserId: true,
      assigneeCredentialId: true,
      assigneeDisplayNameSnapshot: true,
      assigneeAssignedByKind: true,
      assigneeAssignedByUserId: true,
      assigneeAssignedByCredentialId: true,
      assigneeAssignedByDisplayNameSnapshot: true,
      assigneeAssignedAt: true,
      assigneeUser: {
        select: taskPersonSummarySelect,
      },
      assigneeAssignedByUser: {
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

  const actorRegistry = await loadProjectActorRegistry({ db, projectId });

  return {
    id: task.id,
    reference: formatTaskReference(task.referenceNumber),
    title: task.title,
    label: task.label,
    labelsJson: task.labelsJson,
    labels: getTaskLabelsFromStorage(task.labelsJson, task.label),
    description: task.description,
    deadlineDate: formatTaskDeadlineDate(task.deadlineAt),
    commentCount: task._count.comments,
    blockedNote: task.blockedNote,
    status: task.status,
    position: task.position,
    completedAt: task.completedAt,
    archivedAt: task.archivedAt,
    epic: mapTaskEpicSummary(task.epic),
    assignee: mapTaskStoredActor({
      kind: task.assigneeKind,
      userId: task.assigneeUserId,
      credentialId: task.assigneeCredentialId,
      displayNameSnapshot: task.assigneeDisplayNameSnapshot,
      user: task.assigneeUser,
      registry: actorRegistry,
    }),
    assignedBy: mapTaskStoredActor({
      kind: task.assigneeAssignedByKind,
      userId: task.assigneeAssignedByUserId,
      credentialId: task.assigneeAssignedByCredentialId,
      displayNameSnapshot: task.assigneeAssignedByDisplayNameSnapshot,
      user: task.assigneeAssignedByUser,
      registry: actorRegistry,
    }),
    assignedAt: task.assigneeAssignedAt,
    createdBy: mapTaskAuthorRecord({
      author: task.createdByUser,
      agentCredentialId: task.createdByCredentialId,
      agentCredentialLabel: task.createdByCredentialLabel,
    }),
    updatedBy: mapTaskAuthorRecord({
      author: task.updatedByUser,
      agentCredentialId: task.updatedByCredentialId,
      agentCredentialLabel: task.updatedByCredentialLabel,
    }),
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

// Assignment resolves against the project actor registry, so active agent
// credentials become assignable while revoked/expired ones are rejected with
// the established assignee-invalid error token.
async function resolveTaskAssigneeAssignment(input: {
  db: DbClient;
  projectId: string;
  reference: ProjectActorReference;
}): Promise<ServiceResult<ResolvedProjectActorPersistence>> {
  const registry = await loadProjectActorRegistry({
    db: input.db,
    projectId: input.projectId,
  });
  const resolution = resolveAssignableProjectActorFromRegistry({
    registry,
    reference: input.reference,
    assigneeInvalidError: TASK_ASSIGNEE_INVALID,
  });
  if (!resolution.ok) {
    return resolution;
  }

  return { ok: true, data: resolution.actor };
}

async function resolveTaskMutationActorSnapshot(input: {
  db: DbClient;
  actorUserId: string;
  projectId: string;
  agentAccess?: AgentProjectAccessContext;
}): Promise<ServiceResult<ResolvedProjectActorPersistence>> {
  const resolution = await resolveProjectMutationActor(input);
  if (!resolution.ok) {
    return resolution;
  }

  return { ok: true, data: resolution.actor };
}

interface StoredTaskAssigneeIdentity {
  assigneeKind: ProjectActorKind | null;
  assigneeUserId: string | null;
  assigneeCredentialId: string | null;
  assigneeDisplayNameSnapshot: string | null;
}

function isSameStoredTaskAssignee(input: {
  existing: StoredTaskAssigneeIdentity;
  next: ResolvedProjectActorPersistence | null;
}): boolean {
  const existingKind = input.existing.assigneeKind;
  if (!existingKind) {
    return input.next === null;
  }
  if (!input.next) {
    return false;
  }

  const existingId =
    existingKind === "human"
      ? input.existing.assigneeUserId
      : input.existing.assigneeCredentialId;
  const nextId =
    input.next.summary.kind === "human"
      ? input.next.userId
      : input.next.credentialId;
  return existingKind === input.next.summary.kind && existingId === nextId;
}

interface TaskAssignmentProvenance {
  kind: ProjectActorKind;
  userId: string | null;
  credentialId: string | null;
  displayNameSnapshot: string;
  assignedAt: Date;
}

function buildTaskAssignmentWriteData(
  assignment: ResolvedProjectActorPersistence | null,
  provenance: TaskAssignmentProvenance | null
) {
  return {
    assigneeKind: assignment?.summary.kind ?? null,
    assigneeUserId: assignment?.userId ?? null,
    assigneeCredentialId: assignment?.credentialId ?? null,
    assigneeDisplayNameSnapshot: assignment?.displayNameSnapshot ?? null,
    assigneeAssignedByKind: provenance?.kind ?? null,
    assigneeAssignedByUserId: provenance?.userId ?? null,
    assigneeAssignedByCredentialId: provenance?.credentialId ?? null,
    assigneeAssignedByDisplayNameSnapshot:
      provenance?.displayNameSnapshot ?? null,
    assigneeAssignedAt: provenance?.assignedAt ?? null,
  };
}

function buildTaskAssigneeChangeData(input: {
  taskId: string;
  previous: StoredTaskAssigneeIdentity;
  next: ResolvedProjectActorPersistence | null;
  changedBy: ResolvedProjectActorPersistence;
  changedAt: Date;
}) {
  return {
    taskId: input.taskId,
    previousAssigneeKind: input.previous.assigneeKind,
    previousAssigneeUserId: input.previous.assigneeUserId,
    previousAssigneeCredentialId: input.previous.assigneeCredentialId,
    previousAssigneeDisplayNameSnapshot:
      input.previous.assigneeDisplayNameSnapshot,
    nextAssigneeKind: input.next?.summary.kind ?? null,
    nextAssigneeUserId: input.next?.userId ?? null,
    nextAssigneeCredentialId: input.next?.credentialId ?? null,
    nextAssigneeDisplayNameSnapshot: input.next?.displayNameSnapshot ?? null,
    changedByKind: input.changedBy.summary.kind,
    changedByUserId: input.changedBy.userId,
    changedByCredentialId: input.changedBy.credentialId,
    changedByDisplayNameSnapshot: input.changedBy.displayNameSnapshot,
    createdAt: input.changedAt,
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

interface TaskAgentAttribution {
  credentialId: string | null;
  credentialLabel: string | null;
}

// Persists the acting credential id with a durable label snapshot taken at
// write time; later credential renames or revocations never rewrite past
// task attribution. Human-executed mutations keep human-only attribution.
async function resolveTaskAgentAttribution(input: {
  db: DbClient;
  agentAccess?: AgentProjectAccessContext;
}): Promise<TaskAgentAttribution> {
  if (!input.agentAccess) {
    return { credentialId: null, credentialLabel: null };
  }

  const credential = await input.db.apiCredential.findFirst({
    where: {
      id: input.agentAccess.credentialId,
      projectId: input.agentAccess.projectId,
    },
    select: {
      id: true,
      label: true,
    },
  });
  if (!credential) {
    return { credentialId: null, credentialLabel: null };
  }

  return {
    credentialId: credential.id,
    credentialLabel: normalizeText(credential.label) || null,
  };
}

function taskAgentAuthorWriteData(
  attribution: TaskAgentAttribution,
  field: "createdBy" | "updatedBy"
):
  | {
      createdByCredentialId: string | null;
      createdByCredentialLabel: string | null;
    }
  | {
      updatedByCredentialId: string | null;
      updatedByCredentialLabel: string | null;
    } {
  return field === "createdBy"
    ? {
        createdByCredentialId: attribution.credentialId,
        createdByCredentialLabel: attribution.credentialLabel,
      }
    : {
        updatedByCredentialId: attribution.credentialId,
        updatedByCredentialLabel: attribution.credentialLabel,
      };
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
  if (title.length > MAX_TASK_TITLE_LENGTH) {
    return createError(400, "title-too-long");
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

      let resolvedAssignee: ResolvedProjectActorPersistence | null = null;
      let assignmentActor: ResolvedProjectActorPersistence | null = null;
      let assignmentProvenance: TaskAssignmentProvenance | null = null;
      if (input.assignee) {
        const assigneeResolution = await resolveTaskAssigneeAssignment({
          db,
          projectId: input.projectId,
          reference: input.assignee,
        });
        if (!assigneeResolution.ok) {
          return assigneeResolution;
        }
        resolvedAssignee = assigneeResolution.data;

        const mutationActor = await resolveTaskMutationActorSnapshot({
          db,
          actorUserId,
          projectId: input.projectId,
          agentAccess: input.agentAccess,
        });
        if (!mutationActor.ok) {
          return mutationActor;
        }
        assignmentActor = mutationActor.data;
        assignmentProvenance = {
          kind: assignmentActor.summary.kind,
          userId: assignmentActor.userId,
          credentialId: assignmentActor.credentialId,
          displayNameSnapshot: assignmentActor.displayNameSnapshot,
          assignedAt: new Date(),
        };
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

      const agentAttribution = await resolveTaskAgentAttribution({
        db,
        agentAccess: input.agentAccess,
      });

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
          ...taskAgentAuthorWriteData(agentAttribution, "createdBy"),
          ...taskAgentAuthorWriteData(agentAttribution, "updatedBy"),
          ...buildTaskAssignmentWriteData(resolvedAssignee, assignmentProvenance),
        },
        select: { id: true },
      });

      createdTaskId = createdTask.id;

      if (resolvedAssignee && assignmentActor && assignmentProvenance) {
        await db.taskAssigneeChange.create({
          data: buildTaskAssigneeChangeData({
            taskId: createdTask.id,
            previous: {
              assigneeKind: null,
              assigneeUserId: null,
              assigneeCredentialId: null,
              assigneeDisplayNameSnapshot: null,
            },
            next: resolvedAssignee,
            changedBy: assignmentActor,
            changedAt: assignmentProvenance.assignedAt,
          }),
        });
      }

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

      const createdAssigneeUserId =
        resolvedAssignee?.summary.kind === "human" ? resolvedAssignee.userId : null;
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

      const task = await loadTaskMutationPayload(db, input.projectId, createdTask.id);
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

export interface TaskStatusTransitionPayload {
  status: TaskStatus;
  position?: number;
}

export function isTaskStatusTransitionPayload(
  payload: unknown
): payload is TaskStatusTransitionPayload {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const candidate = payload as TaskStatusTransitionPayload;
  if (!isTaskStatus(candidate.status)) {
    return false;
  }

  if (
    candidate.position !== undefined &&
    (!Number.isInteger(candidate.position) || candidate.position < 0)
  ) {
    return false;
  }

  return true;
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

      if (sameColumn) {
        const shiftDown = finalPosition > existingTask.position;
        const shiftedTasks = destinationTasks
          .filter((task) =>
            shiftDown
              ? task.position > existingTask.position &&
                task.position <= finalPosition
              : task.position >= finalPosition &&
                task.position < existingTask.position
          )
          .sort((left, right) =>
            shiftDown
              ? right.position - left.position
              : left.position - right.position
          );

        for (const task of shiftedTasks) {
          await db.task.update({
            where: { id: task.id },
            data: { position: shiftDown ? task.position - 1 : task.position + 1 },
          });
        }
      } else if (
        destinationTasks.some((task) => task.position >= finalPosition)
      ) {
        await db.task.updateMany({
          where: {
            projectId,
            status: targetStatus,
            position: { gte: finalPosition },
          },
          data: { position: { increment: 1 } },
        });
      }

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
        // Compact the source lane so lanes stay dense: a later append uses the
        // lane count as its position and would collide with any hole left by
        // this move.
        await db.task.updateMany({
          where: {
            projectId,
            status: existingTask.status,
            position: { gt: existingTask.position },
          },
          data: { position: { decrement: 1 } },
        });
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
  // Transport precedence: the structured `assignee` reference wins over the
  // legacy human-only `assigneeUserId` shorthand when both are present.
  const assigneeReferenceProvided =
    Object.prototype.hasOwnProperty.call(payload, "assignee") &&
    payload.assignee !== undefined;
  let assigneeReference: ProjectActorReference | null = null;
  if (assigneeReferenceProvided) {
    if (payload.assignee === null) {
      assigneeReference = null;
    } else if (isProjectActorReference(payload.assignee)) {
      assigneeReference = {
        kind: payload.assignee.kind,
        id: payload.assignee.id.trim(),
      };
    } else {
      return createError(400, TASK_ASSIGNEE_INVALID);
    }
  } else if (Object.prototype.hasOwnProperty.call(payload, "assigneeUserId")) {
    const legacyAssigneeUserId = normalizeText(payload.assigneeUserId);
    assigneeReference = legacyAssigneeUserId
      ? { kind: "human", id: legacyAssigneeUserId }
      : null;
  }
  const assigneeProvided =
    assigneeReferenceProvided ||
    Object.prototype.hasOwnProperty.call(payload, "assigneeUserId");
  const attachmentLinksProvided = Object.prototype.hasOwnProperty.call(
    payload,
    "attachmentLinks"
  );
  const parsedAttachmentLinks = attachmentLinksProvided
    ? parseAttachmentLinksJson(serializeJsonFieldValue(payload.attachmentLinks))
    : null;
  if (parsedAttachmentLinks?.error) {
    return createError(400, parsedAttachmentLinks.error);
  }
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
  if (titleProvided && title.length > MAX_TASK_TITLE_LENGTH) {
    return createError(400, "title-too-long");
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
          assigneeKind: true,
          assigneeUserId: true,
          assigneeCredentialId: true,
          assigneeDisplayNameSnapshot: true,
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

      let nextAssignment: ResolvedProjectActorPersistence | null = null;
      if (assigneeProvided && assigneeReference) {
        const assigneeResolution = await resolveTaskAssigneeAssignment({
          db,
          projectId,
          reference: assigneeReference,
        });
        if (!assigneeResolution.ok) {
          return assigneeResolution;
        }
        nextAssignment = assigneeResolution.data;
      }

      const assignmentChanged =
        assigneeProvided &&
        !isSameStoredTaskAssignee({
          existing: existingTask,
          next: nextAssignment,
        });

      let assignmentWriteData: ReturnType<
        typeof buildTaskAssignmentWriteData
      > | null = null;
      let pendingAssigneeChange: ReturnType<
        typeof buildTaskAssigneeChangeData
      > | null = null;
      if (assignmentChanged) {
        const mutationActor = await resolveTaskMutationActorSnapshot({
          db,
          actorUserId: normalizedActorUserId,
          projectId,
          agentAccess,
        });
        if (!mutationActor.ok) {
          return mutationActor;
        }

        const assignedAt = new Date();
        assignmentWriteData = buildTaskAssignmentWriteData(nextAssignment, {
          kind: mutationActor.data.summary.kind,
          userId: mutationActor.data.userId,
          credentialId: mutationActor.data.credentialId,
          displayNameSnapshot: mutationActor.data.displayNameSnapshot,
          assignedAt,
        });
        pendingAssigneeChange = buildTaskAssigneeChangeData({
          taskId,
          previous: existingTask,
          next: nextAssignment,
          changedBy: mutationActor.data,
          changedAt: assignedAt,
        });
      }

      const updateWithClient = async (tx: typeof db) => {
        const agentAttribution = await resolveTaskAgentAttribution({
          db: tx,
          agentAccess,
        });

        await tx.task.update({
          where: { id: taskId },
          data: {
            updatedByUserId: normalizedActorUserId,
            ...taskAgentAuthorWriteData(agentAttribution, "updatedBy"),
            epicId: epicValidation.data.epicId,
            ...(assignmentWriteData ?? {}),
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

        if (parsedAttachmentLinks && parsedAttachmentLinks.links.length > 0) {
          await createTaskAttachmentsFromDraft({
            actorUserId: normalizedActorUserId,
            projectId,
            taskId,
            links: parsedAttachmentLinks.links,
            files: [],
            db: tx,
          });
        }

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

        if (pendingAssigneeChange) {
          await tx.taskAssigneeChange.create({
            data: pendingAssigneeChange,
          });
        }

        return loadTaskMutationPayload(tx, projectId, taskId);
      };

      const updatedTask = await updateWithClient(db);

      if (!updatedTask) {
        return createError(404, "Task not found");
      }

      const previousAssigneeUserId =
        existingTask.assigneeKind === "human" ? existingTask.assigneeUserId : null;
      const updatedAssigneeUserId =
        nextAssignment?.summary.kind === "human" ? nextAssignment.userId : null;
      if (
        assignmentChanged &&
        previousAssigneeUserId &&
        previousAssigneeUserId !== updatedAssigneeUserId
      ) {
        await resolveTaskAssignmentNotifications({
          db,
          taskIds: [taskId],
          recipientUserId: previousAssigneeUserId,
        });
      }

      if (
        assignmentChanged &&
        previousAssigneeUserId !== updatedAssigneeUserId &&
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
