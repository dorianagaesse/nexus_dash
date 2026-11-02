import type { AgentProjectAccessContext } from "@/lib/services/project-access-service";
import {
  type NotificationActorKind,
  createTaskAssignmentNotification,
} from "@/lib/services/notification-service";
import { taskPersonSummarySelect } from "@/lib/task-person";
import type { DbClient } from "@/lib/services/rls-context";
import type { ProjectActorReference } from "@/lib/project-actor";
import {
  loadProjectActorRegistry,
  resolveAssignableProjectActorFromRegistry,
  resolveProjectMutationActor,
  type ResolvedProjectActorPersistence,
} from "@/lib/services/project-actor-service";
import { TASK_ASSIGNEE_INVALID_ERROR } from "@/lib/task-contracts";
import type {
  ServiceResult,
  PendingTaskAssignmentNotification,
  StoredTaskAssigneeIdentity,
  TaskAssignmentProvenance,
  TaskAgentAttribution,
} from "./task-types";
import { normalizeText } from "./task-input";

// Assignment resolves against the project actor registry, so active agent
// credentials become assignable while revoked/expired ones are rejected with
// the established assignee-invalid error token.
export async function resolveTaskAssigneeAssignment(input: {
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
    assigneeInvalidError: TASK_ASSIGNEE_INVALID_ERROR,
  });
  if (!resolution.ok) {
    return resolution;
  }

  return { ok: true, data: resolution.actor };
}

export async function resolveTaskMutationActorSnapshot(input: {
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

export function isSameStoredTaskAssignee(input: {
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

export function buildTaskAssignmentWriteData(
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

export function buildTaskAssigneeChangeData(input: {
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

export function buildTaskPath(projectId: string, taskId: string): string {
  return `/projects/${encodeURIComponent(projectId)}?taskId=${encodeURIComponent(taskId)}`;
}

export function buildPersonDisplayName(input: {
  name: string | null;
  email: string | null;
  username: string | null;
}): string {
  return input.name || input.email || input.username || "Someone";
}

export function buildAgentDisplayName(label: string | null | undefined): string {
  const normalizedLabel = normalizeText(label);
  return normalizedLabel ? `${normalizedLabel} (agent)` : "Agent";
}

export async function resolveAgentCredentialLabel(input: {
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

// Persists the acting credential id with a durable label snapshot taken at
// write time; later credential renames or revocations never rewrite past
// task attribution. Human-executed mutations keep human-only attribution.
export async function resolveTaskAgentAttribution(input: {
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

export function taskAgentAuthorWriteData(
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

export function shouldNotifyAssignee(input: {
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

export async function buildTaskAssignmentNotification(input: {
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

export async function dispatchTaskAssignmentNotification(input: {
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
