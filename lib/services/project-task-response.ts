import { mapTaskEpicSummary, type TaskEpicSummary } from "@/lib/epic";
import type { ProjectActorKind, ProjectActorSummary } from "@/lib/project-actor";
import {
  mapTaskAttachmentResponse,
  type AttachmentResponsePayload,
} from "@/lib/services/project-attachment-service";
import {
  mapStoredProjectActorFromRegistry,
  type ProjectActorRegistry,
} from "@/lib/services/project-actor-service";
import type { ProjectKanbanTaskRecord } from "@/lib/services/project-service";
import { mapTaskAuthorRecord, type TaskAuthorSummary } from "@/lib/task-author";
import { formatTaskDeadlineDate } from "@/lib/task-deadline";
import { getTaskLabelsFromStorage } from "@/lib/task-label";
import type { TaskPersonRecord } from "@/lib/task-person";
import { formatTaskReference } from "@/lib/task-reference";
import {
  mergeRelatedTaskSummaries,
  type RelatedTaskSummary,
} from "@/lib/task-related";

export interface TaskResponseRecord {
  id: string;
  reference: string;
  title: string;
  description: string | null;
  blockedNote: string | null;
  deadlineDate: string | null;
  commentCount: number;
  completedAt: Date | null;
  archivedAt: Date | null;
  status: string;
  position: number;
  label: string | null;
  labelsJson: string | null;
  labels: string[];
  createdAt: Date;
  updatedAt: Date;
  epic: TaskEpicSummary | null;
  assignee: ProjectActorSummary | null;
  assignedBy: ProjectActorSummary | null;
  assignedAt: Date | null;
  createdBy: TaskAuthorSummary;
  updatedBy: TaskAuthorSummary;
  attachments: AttachmentResponsePayload[];
  relatedTasks: RelatedTaskSummary[];
  blockedFollowUps: ProjectKanbanTaskRecord["blockedFollowUps"];
}

// Resolves a stored task actor triple (kind plus the kind-matched id column)
// against the project actor registry so live credential status survives for
// every project member; null fields collapse to "unassigned".
export function mapTaskStoredActor(
  input: {
    kind: ProjectActorKind | null;
    userId: string | null;
    credentialId: string | null;
    displayNameSnapshot: string | null;
    user: TaskPersonRecord | null;
    registry: ProjectActorRegistry | null;
  }
): ProjectActorSummary | null {
  if (!input.kind) {
    return null;
  }

  return mapStoredProjectActorFromRegistry({
    kind: input.kind,
    id: input.kind === "human" ? input.userId : input.credentialId,
    displayNameSnapshot: input.displayNameSnapshot,
    user: input.user,
    registry: input.registry,
  });
}

export function mapProjectKanbanTaskToTaskResponse(
  task: ProjectKanbanTaskRecord,
  projectId: string,
  actorRegistry: ProjectActorRegistry | null = null
): TaskResponseRecord {
  return {
    id: task.id,
    reference: formatTaskReference(task.referenceNumber),
    title: task.title,
    description: task.description,
    blockedNote: task.blockedNote,
    deadlineDate: formatTaskDeadlineDate(task.deadlineAt),
    commentCount: task._count.comments,
    completedAt: task.completedAt,
    archivedAt: task.archivedAt,
    status: task.status,
    position: task.position,
    label: task.label,
    labelsJson: task.labelsJson,
    labels: getTaskLabelsFromStorage(task.labelsJson, task.label),
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
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
    attachments: task.attachments.map((attachment) =>
      mapTaskAttachmentResponse(projectId, task.id, attachment)
    ),
    relatedTasks: mergeRelatedTaskSummaries(task),
    blockedFollowUps: task.blockedFollowUps,
  };
}
