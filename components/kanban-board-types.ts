import type { TaskStatus } from "@/lib/task-status";

export interface TaskBlockedFollowUp {
  id: string;
  content: string;
  createdAt: string;
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
  labels: string[];
  blockedFollowUps: TaskBlockedFollowUp[];
  status: TaskStatus;
  attachments: TaskAttachment[];
}

export interface PendingAttachmentUpload {
  id: string;
  name: string;
  sizeBytes: number;
}

export interface TaskMutationStatus {
  phase: "running" | "done" | "failed";
  message: string;
}
