export interface TaskAttachmentActorFields {
  uploadedByUserId?: string;
  uploadedByCredentialId?: string | null;
  uploadedByKind?: "human" | "agent";
  uploadedByDisplayNameSnapshot?: string;
}

export interface TaskAttachmentActor {
  kind: "human" | "agent";
  id: string | null;
  displayName: string;
}

export const taskAttachmentActorSelect = {
  uploadedByUserId: true,
  uploadedByCredentialId: true,
  uploadedByKind: true,
  uploadedByDisplayNameSnapshot: true,
} as const;

export function taskAttachmentActor(fields: TaskAttachmentActorFields): TaskAttachmentActor | undefined {
  if (!fields.uploadedByKind) return undefined;
  return {
    kind: fields.uploadedByKind,
    id: fields.uploadedByKind === "agent" ? fields.uploadedByCredentialId ?? null : fields.uploadedByUserId ?? null,
    displayName: fields.uploadedByDisplayNameSnapshot || "Unknown uploader",
  };
}
