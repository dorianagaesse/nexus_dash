export interface ProjectContextAttachment {
  id: string;
  kind: string;
  name: string;
  url: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  downloadUrl: string | null;
}

export interface ProjectContextCard {
  id: string;
  title: string;
  content: string;
  color: string;
  attachments: ProjectContextAttachment[];
}

export interface PendingAttachmentLink {
  id: string;
  url: string;
}

export interface ContextMutationStatus {
  phase: "running" | "done" | "failed";
  message: string;
}
