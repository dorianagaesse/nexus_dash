import { expect, test } from "vitest";
import { taskAttachmentActor } from "@/lib/task-attachment-actor";

test("deleted credentials retain agent provenance without inheriting their human owner", () => {
  expect(taskAttachmentActor({ uploadedByKind: "agent", uploadedByCredentialId: null, uploadedByUserId: "owner", uploadedByDisplayNameSnapshot: "Oscar" })).toEqual({ kind: "agent", id: null, displayName: "Oscar" });
});
