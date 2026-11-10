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

/** The storage owner is not an uploader identity: credentials are separate actors. */
export function taskAttachmentUploaderWhere(actorUserId: string, credentialId?: string) {
  return {
    uploadedByUserId: actorUserId,
    uploadedByKind: credentialId ? "agent" as const : "human" as const,
    uploadedByCredentialId: credentialId ?? null,
  };
}

export function isTaskAttachmentUploader(fields: TaskAttachmentActorFields, actorUserId: string, credentialId?: string): boolean {
  const expected = taskAttachmentUploaderWhere(actorUserId, credentialId);
  return fields.uploadedByUserId === expected.uploadedByUserId &&
    (fields.uploadedByKind ?? "human") === expected.uploadedByKind &&
    (fields.uploadedByCredentialId ?? null) === expected.uploadedByCredentialId;
}

export function taskUploadStorageOwnerId(taskId: string, credentialId?: string): string {
  return credentialId ? `${taskId}/actors/agent/${credentialId}` : taskId;
}

export function isTaskUploadStorageKey(storageKey: string, actorUserId: string, projectId: string, taskId: string, credentialId?: string): boolean {
  const prefix = `v1/${actorUserId}/${projectId}/task/${taskUploadStorageOwnerId(taskId, credentialId)}/`;
  if (!storageKey.startsWith(prefix)) return false;
  const filename = storageKey.slice(prefix.length);
  return !!filename && !/[\\/]/.test(filename) && filename !== "." && filename !== "..";
}
