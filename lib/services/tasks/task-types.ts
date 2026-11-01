import type { RelatedTaskSummary } from "@/lib/task-related";
import type { TaskEpicSummary } from "@/lib/epic";
import type { TaskStatus } from "@/lib/task-status";
import type { AgentProjectAccessContext } from "@/lib/services/project-access-service";
import type { TaskAssignmentNotificationInput } from "@/lib/services/notification-service";
import type { TaskAuthorSummary } from "@/lib/task-author";
import type {
  ProjectActorKind,
  ProjectActorReference,
  ProjectActorSummary,
} from "@/lib/project-actor";
import type { VersionedContent } from "@/lib/content-revision";

export interface InvalidRelatedTaskDiagnostic {
  id: string;
  reason: "archived" | "missing" | "cross-project" | "self";
}

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

export interface ReorderColumnPayload {
  status: string;
  taskIds: string[];
}

export interface ReorderPayload {
  columns: ReorderColumnPayload[];
}

export interface UpdateTaskPayload {
  title?: string;
  label?: string;
  labels?: string[];
  description?: string;
  deadlineDate?: string | null;
  blockedFollowUpEntry?: string;
  relatedTaskIds?: string[];
  addRelatedTaskIds?: string[];
  removeRelatedTaskIds?: string[];
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

export interface TaskStatusTransitionPayload {
  status: TaskStatus;
  position?: number;
}
