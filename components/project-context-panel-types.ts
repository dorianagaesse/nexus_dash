export interface ProjectContextAttachment {
  id: string;
  kind: string;
  name: string;
  url: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  downloadUrl: string | null;
}

export interface ProjectContextAttachmentProjection {
  id: string;
  kind: string;
  name: string;
  url: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  uploadedBy: ProjectContextActorSummary | null;
  uploadedByDisplayNameSnapshot: string;
  uploadedAt: string;
}

export interface ProjectContextActorSummary {
  kind: "human" | "agent";
  id: string;
  displayName: string;
  usernameTag: string | null;
  avatarSeed: string | null;
  status: "active" | "inactive" | "revoked" | "expired";
  isAssignable: boolean;
}

export interface ProjectContextReviewState {
  needsReview: boolean;
  thresholdDays: number;
  lastEditedAt: string;
}

export interface ProjectContextCardProjection {
  id: string;
  creator: ProjectContextActorSummary | null;
  lastEditor: ProjectContextActorSummary | null;
  steward: ProjectContextActorSummary | null;
  review: ProjectContextReviewState;
  attachments: ProjectContextAttachmentProjection[];
}

export interface ProjectContextCard {
  id: string;
  title: string;
  content: string;
  color: string;
  createdAt: string;
  updatedAt: string;
  attachments: ProjectContextAttachment[];
  projection: ProjectContextCardProjection;
}

export interface PendingAttachmentLink {
  id: string;
  url: string;
}
