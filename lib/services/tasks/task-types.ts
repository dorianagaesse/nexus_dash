import type { RelatedTaskSummary } from "@/lib/task-related";
import type { TaskEpicSummary } from "@/lib/epic";
import type { AgentProjectAccessContext } from "@/lib/services/project-access-service";
import type { TaskAssignmentNotificationInput } from "@/lib/services/notification-service";
import type { TaskAuthorSummary } from "@/lib/task-author";
import type { ProjectActorKind, ProjectActorSummary } from "@/lib/project-actor";
import type { VersionedContent } from "@/lib/content-revision";
import type {
  CreateTaskCommand,
  CreateTaskLegacyFields,
  InvalidRelatedTaskDiagnostic,
} from "@/lib/task-contracts";

export interface ServiceErrorResult {
  ok: false;
  status: number;
  error: string;
  current?: VersionedContent;
  invalidRelatedTask?: InvalidRelatedTaskDiagnostic;
}

export interface ServiceSuccessResult<T> {
  ok: true;
  data: T;
}

export type ServiceResult<T> = ServiceSuccessResult<T> | ServiceErrorResult;

export type CreateTaskForProjectInput = (
  | CreateTaskLegacyFields
  | CreateTaskCommand
) & {
  actorUserId: string;
  projectId: string;
  agentAccess?: AgentProjectAccessContext;
};

export interface UpdatedTaskPayload {
  id: string;
  contentRevision: number;
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
    commentId: string | null;
    kind: string;
    name: string;
    url: string | null;
    mimeType: string | null;
    sizeBytes: number | null;
  }[];
}

export interface PendingTaskAssignmentNotification {
  recipientUserId: string;
  notification: TaskAssignmentNotificationInput;
}

export interface StoredTaskAssigneeIdentity {
  assigneeKind: ProjectActorKind | null;
  assigneeUserId: string | null;
  assigneeCredentialId: string | null;
  assigneeDisplayNameSnapshot: string | null;
}

export interface TaskAssignmentProvenance {
  kind: ProjectActorKind;
  userId: string | null;
  credentialId: string | null;
  displayNameSnapshot: string;
  assignedAt: Date;
}

export interface TaskAgentAttribution {
  credentialId: string | null;
  credentialLabel: string | null;
}
