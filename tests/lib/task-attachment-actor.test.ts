import { expect, test } from "vitest";
import { isTaskAttachmentUploader, isTaskUploadStorageKey, taskAttachmentActor } from "@/lib/task-attachment-actor";

test("deleted credentials retain agent provenance without inheriting their human owner", () => {
  expect(taskAttachmentActor({ uploadedByKind: "agent", uploadedByCredentialId: null, uploadedByUserId: "owner", uploadedByDisplayNameSnapshot: "Oscar" })).toEqual({ kind: "agent", id: null, displayName: "Oscar" });
});

test("draft uploader matching separates two credentials and their shared human owner", () => {
  for (const credentialId of [undefined, "a", "b"]) {
    const stored = { uploadedByKind: credentialId ? "agent" as const : "human" as const, uploadedByUserId: "owner", uploadedByCredentialId: credentialId ?? null };
    for (const caller of [undefined, "a", "b"]) expect(isTaskAttachmentUploader(stored, "owner", caller)).toBe(caller === credentialId);
    expect(isTaskAttachmentUploader(stored, "outsider", credentialId)).toBe(false);
  }
  expect(isTaskAttachmentUploader({ uploadedByKind: "agent", uploadedByUserId: "owner", uploadedByCredentialId: null }, "owner")).toBe(false);
});

test("direct object authority is scoped to an exact actor and a single filename", () => {
  const base = "v1/owner/project/task/task/";
  expect(isTaskUploadStorageKey(`${base}file.txt`, "owner", "project", "task")).toBe(true);
  expect(isTaskUploadStorageKey(`${base}file.txt`, "owner", "project", "task", "a")).toBe(false);
  expect(isTaskUploadStorageKey(`${base}actors/agent/a/file.txt`, "owner", "project", "task", "a")).toBe(true);
  for (const actor of [undefined, "b"]) expect(isTaskUploadStorageKey(`${base}actors/agent/a/file.txt`, "owner", "project", "task", actor)).toBe(false);
  for (const filename of ["", "..", "../file", "nested/file", "nested\\file"]) expect(isTaskUploadStorageKey(base + filename, "owner", "project", "task")).toBe(false);
});
