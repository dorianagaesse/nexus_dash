import type { TaskStatus } from "@/lib/task-status";

export interface TaskPersonSummary {
  id: string;
  displayName: string;
  usernameTag: string | null;
  avatarSeed: string;
}

export type ProjectTaskCollaboratorRole = "owner" | "editor" | "viewer";

export interface TaskBlockedFollowUp {
  id: string;
  content: string;
  createdAt: string;
}

export interface TaskRelatedSummary {
  id: string;
  title: string;
  status: string;
  archivedAt: string | null;
}

export interface TaskEpicSummary {
  id: string;
  name: string;
}

export interface ProjectEpicOption extends TaskEpicSummary {
  status: "Ready" | "In progress" | "Completed";
  progressPercent: number;
  taskCount: number;
}

export type TaskCommentAuthor = TaskPersonSummary;

export interface TaskComment {
  id: string;
  content: string;
  createdAt: string;
  author: TaskCommentAuthor;
}

export interface TaskAttachment {
  id: string;
  kind: string;
  name: string;
  url: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  downloadUrl: string | null;
}

export interface KanbanTask {
  id: string;
  title: string;
  description: string | null;
  deadlineDate: string | null;
  commentCount: number;
  labels: string[];
  blockedFollowUps: TaskBlockedFollowUp[];
  status: TaskStatus;
  archivedAt: string | null;
  attachments: TaskAttachment[];
  relatedTasks: TaskRelatedSummary[];
  epic: TaskEpicSummary | null;
  assignee: TaskPersonSummary | null;
  createdBy: TaskPersonSummary;
  updatedBy: TaskPersonSummary;
  createdAt: string;
  updatedAt: string;
}

export interface PendingAttachmentUpload {
  id: string;
  name: string;
  sizeBytes: number;
}

export interface ProjectTaskCollaborator extends TaskPersonSummary {
  projectRole: ProjectTaskCollaboratorRole;
}
