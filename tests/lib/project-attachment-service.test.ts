import { beforeEach, describe, expect, test, vi } from "vitest";

import { RESOURCE_TYPE_CONTEXT_CARD } from "@/lib/resource-type";
import { AttachmentStorageUnavailableError } from "@/lib/storage/errors";

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  $executeRaw: vi.fn(),
  projectActivityEvent: { create: vi.fn() },
  project: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  task: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  resource: {
    findUnique: vi.fn(),
  },
  taskAttachment: {
    findFirst: vi.fn(),
    createMany: vi.fn(),
    create: vi.fn(),
    findUnique: vi.fn(),
    delete: vi.fn(),
  },
  apiCredential: { findFirst: vi.fn() },
  resourceAttachment: {
    createMany: vi.fn(),
    create: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
  },
}));

const attachmentStorageMock = vi.hoisted(() => ({
  saveAttachmentFile: vi.fn(),
  createAttachmentSignedUploadUrl: vi.fn(),
  readAttachmentStoredFileMetadata: vi.fn(),
  deleteAttachmentFile: vi.fn(),
  getAttachmentDownloadUrl: vi.fn(),
  readAttachmentFile: vi.fn(),
}));

const loggerMock = vi.hoisted(() => ({
  logServerError: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/attachment-storage", () => ({
  saveAttachmentFile: attachmentStorageMock.saveAttachmentFile,
  createAttachmentSignedUploadUrl:
    attachmentStorageMock.createAttachmentSignedUploadUrl,
  readAttachmentStoredFileMetadata:
    attachmentStorageMock.readAttachmentStoredFileMetadata,
  deleteAttachmentFile: attachmentStorageMock.deleteAttachmentFile,
  getAttachmentDownloadUrl: attachmentStorageMock.getAttachmentDownloadUrl,
  readAttachmentFile: attachmentStorageMock.readAttachmentFile,
}));

vi.mock("@/lib/observability/logger", () => ({
  logServerError: loggerMock.logServerError,
}));

import {
  createTaskAttachmentsFromDraft,
  createContextAttachmentUploadTarget,
  createContextAttachmentsFromDraft,
  createContextAttachmentFromForm,
  createTaskAttachmentUploadTarget,
  createTaskAttachmentFromForm,
  deleteTaskAttachmentForProject,
  getTaskAttachmentDownload,
  finalizeContextAttachmentDirectUpload,
  finalizeTaskAttachmentDirectUpload,
} from "@/lib/services/project-attachment-service";

describe("project-attachment-service", () => {
  const actorUserId = "user-1";

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.taskAttachment.findFirst.mockResolvedValue(null);
    prismaMock.apiCredential.findFirst.mockResolvedValue({
      id: "credential-1", projectId: "project-1", label: "TellmetrY agent",
      revokedAt: null, expiresAt: null,
    });
    prismaMock.projectActivityEvent.create.mockImplementation(async ({ data }) => ({
      id: "event-1", createdAt: new Date(), ...data,
    }));
    prismaMock.$transaction.mockImplementation(async (callback) => callback(prismaMock));
    prismaMock.project.findFirst.mockResolvedValue({ ownerId: actorUserId, memberships: [] });
    prismaMock.user.findUnique.mockResolvedValue({
      id: actorUserId,
      name: "Ada Lovelace",
      email: "ada@example.com",
      username: "ada",
      usernameDiscriminator: "0001",
      avatarSeed: "seed-ada",
    });
    prismaMock.task.update.mockResolvedValue({ id: "task-1" });
    prismaMock.project.update.mockResolvedValue({ id: "project-1" });
  });

  test("multipart agent uploads reject missing scope before touching storage", async () => {
    const result = await createTaskAttachmentFromForm({ actorUserId, projectId: "project-1", taskId: "task-1", formData: new FormData(), agentAccess: { projectId: "project-1", credentialId: "a", scopes: ["task:read"] } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
    expect(attachmentStorageMock.saveAttachmentFile).not.toHaveBeenCalled();
  });

  test.each(["credential-a", "credential-b"])("persists distinct task link uploader %s", async (credentialId) => {
    prismaMock.apiCredential.findFirst.mockResolvedValue({ id: credentialId, label: credentialId, revokedAt: null, expiresAt: null });
    await createTaskAttachmentsFromDraft({ actorUserId, projectId: "project-1", taskId: "task-1", links: [{ name: "Spec", url: "https://example.com" }], files: [], agentAccess: { credentialId, projectId: "project-1", scopes: ["task:write"] } });
    expect(prismaMock.taskAttachment.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ uploadedByUserId: actorUserId, uploadedByKind: "agent", uploadedByCredentialId: credentialId, uploadedByDisplayNameSnapshot: credentialId })] });
  });

  test("human attachment deletion clears the previous agent editor", async () => {
    prismaMock.taskAttachment.findUnique.mockResolvedValueOnce({ id: "att-1", kind: "link", task: { id: "task-1", projectId: "project-1" } });
    const result = await deleteTaskAttachmentForProject({ actorUserId, projectId: "project-1", taskId: "task-1", attachmentId: "att-1" });
    expect(result.ok).toBe(true);
    expect(prismaMock.task.update).toHaveBeenCalledWith(expect.objectContaining({ data: { updatedByUserId: actorUserId, updatedByCredentialId: null, updatedByCredentialLabel: null } }));
  });

  test("allows an editor to delete their own unbound task upload", async () => {
    prismaMock.project.findFirst.mockResolvedValueOnce({
      ownerId: "owner-1",
      memberships: [{ role: "editor" }],
    });
    prismaMock.taskAttachment.findUnique.mockResolvedValueOnce({
      id: "att-draft",
      kind: "file",
      storageKey: null,
      uploadedByUserId: actorUserId,
      commentId: null,
      task: { id: "task-1", projectId: "project-1" },
    });
    prismaMock.taskAttachment.delete.mockResolvedValueOnce({ id: "att-draft" });

    const result = await deleteTaskAttachmentForProject({
      actorUserId,
      projectId: "project-1",
      taskId: "task-1",
      attachmentId: "att-draft",
    });

    expect(result).toEqual({ ok: true, data: { ok: true } });
    expect(prismaMock.taskAttachment.delete).toHaveBeenCalledWith({
      where: { id: "att-draft" },
    });
    expect(prismaMock.projectActivityEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          domain: "task",
          action: "updated",
          entityId: "task-1",
          payload: expect.objectContaining({ taskId: "task-1", deletedAttachmentId: "att-draft" }),
        }),
      })
    );
  });

  test("prevents an editor from deleting another actor's task upload", async () => {
    prismaMock.project.findFirst.mockResolvedValueOnce({
      ownerId: "owner-1",
      memberships: [{ role: "editor" }],
    });
    prismaMock.taskAttachment.findUnique.mockResolvedValueOnce({
      id: "att-other",
      kind: "file",
      storageKey: null,
      uploadedByUserId: "user-2",
      commentId: null,
      task: { id: "task-1", projectId: "project-1" },
    });

    const result = await deleteTaskAttachmentForProject({
      actorUserId,
      projectId: "project-1",
      taskId: "task-1",
      attachmentId: "att-other",
    });

    expect(result).toEqual({ ok: false, status: 403, error: "forbidden" });
    expect(prismaMock.taskAttachment.delete).not.toHaveBeenCalled();
  });

  test("maps task upload storage-unavailable errors to actionable message", async () => {
    prismaMock.task.findUnique.mockResolvedValueOnce({
      id: "task-1",
      projectId: "project-1",
    });
    attachmentStorageMock.saveAttachmentFile.mockRejectedValueOnce(
      new AttachmentStorageUnavailableError("Local attachment storage is unavailable")
    );

    const formData = new FormData();
    formData.set("kind", "file");
    formData.set("file", new File(["hello"], "note.txt", { type: "text/plain" }));

    const result = await createTaskAttachmentFromForm({
      actorUserId,
      projectId: "project-1",
      taskId: "task-1",
      formData,
    });

    expect(result).toEqual({
      ok: false,
      status: 500,
      error:
        "Attachment storage is not configured for this environment. Configure STORAGE_PROVIDER=r2 and R2 credentials, then redeploy.",
    });
    expect(prismaMock.taskAttachment.create).not.toHaveBeenCalled();
    expect(attachmentStorageMock.deleteAttachmentFile).not.toHaveBeenCalled();
  });

  test("maps context upload storage-unavailable errors to actionable message", async () => {
    prismaMock.resource.findUnique.mockResolvedValueOnce({
      id: "card-1",
      projectId: "project-1",
      type: RESOURCE_TYPE_CONTEXT_CARD,
    });
    attachmentStorageMock.saveAttachmentFile.mockRejectedValueOnce(
      new AttachmentStorageUnavailableError("Local attachment storage is unavailable")
    );

    const formData = new FormData();
    formData.set("kind", "file");
    formData.set("file", new File(["hello"], "note.txt", { type: "text/plain" }));

    const result = await createContextAttachmentFromForm({
      actorUserId,
      projectId: "project-1",
      cardId: "card-1",
      formData,
    });

    expect(result).toEqual({
      ok: false,
      status: 500,
      error:
        "Attachment storage is not configured for this environment. Configure STORAGE_PROVIDER=r2 and R2 credentials, then redeploy.",
    });
    expect(prismaMock.resourceAttachment.create).not.toHaveBeenCalled();
    expect(attachmentStorageMock.deleteAttachmentFile).not.toHaveBeenCalled();
  });

  test.each(["link", "file"])(
    "emits a task attachment event for a %s upload",
    async (kind) => {
      prismaMock.task.findUnique.mockResolvedValueOnce({
        id: "task-1",
        projectId: "project-1",
      });
      const attachment = {
        id: "att-1",
        commentId: null,
        kind,
        name: "note",
        url: kind === "link" ? "https://example.com/" : null,
        mimeType: kind === "file" ? "text/plain" : null,
        sizeBytes: kind === "file" ? 5 : null,
      };
      prismaMock.taskAttachment.create.mockResolvedValueOnce(attachment);
      attachmentStorageMock.saveAttachmentFile.mockResolvedValueOnce({
        storageKey: "key",
        originalName: "note.txt",
        mimeType: "text/plain",
        sizeBytes: 5,
      });
      const formData = new FormData();
      formData.set("kind", kind);
      formData.set("url", "https://example.com/");
      formData.set(
        "file",
        new File(["hello"], "note.txt", { type: "text/plain" })
      );
      const result = await createTaskAttachmentFromForm({
        actorUserId,
        projectId: "project-1",
        taskId: "task-1",
        formData,
      });
      expect(result.ok).toBe(true);
      expect(prismaMock.projectActivityEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            domain: "task",
            action: "updated",
            entityId: "task-1",
            payload: {
              actor: { kind: "human", id: actorUserId, displayName: "ada" },
              taskId: "task-1",
              attachment: expect.objectContaining(attachment),
            },
          }),
        })
      );
    }
  );

  test("creates task direct-upload target when storage provider supports signed uploads", async () => {
    prismaMock.task.findUnique.mockResolvedValueOnce({
      id: "task-1",
      projectId: "project-1",
    });
    attachmentStorageMock.createAttachmentSignedUploadUrl.mockResolvedValueOnce({
      storageKey: "task/task-1/key-spec.pdf",
      uploadUrl: "https://example.r2/upload",
      method: "PUT",
      headers: { "Content-Type": "application/pdf" },
      expiresInSeconds: 300,
    });

    const result = await createTaskAttachmentUploadTarget({
      actorUserId,
      projectId: "project-1",
      taskId: "task-1",
      name: "spec.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
    });

    expect(result).toEqual({
      ok: true,
      data: {
        upload: {
          storageKey: "task/task-1/key-spec.pdf",
          uploadUrl: "https://example.r2/upload",
          method: "PUT",
          headers: { "Content-Type": "application/pdf" },
          expiresInSeconds: 300,
          maxFileSizeBytes: 26214400,
          maxFileSizeLabel: "25MB",
        },
      },
    });
  });

  test("normalizes direct-upload mime type from filename when browser reports empty mime", async () => {
    prismaMock.task.findUnique.mockResolvedValueOnce({
      id: "task-1",
      projectId: "project-1",
    });
    attachmentStorageMock.createAttachmentSignedUploadUrl.mockResolvedValueOnce({
      storageKey: "task/task-1/key-ios-photo.heic",
      uploadUrl: "https://example.r2/upload",
      method: "PUT",
      headers: { "Content-Type": "image/heic" },
      expiresInSeconds: 300,
    });

    const result = await createTaskAttachmentUploadTarget({
      actorUserId,
      projectId: "project-1",
      taskId: "task-1",
      name: "ios-photo.HEIC",
      mimeType: "",
      sizeBytes: 1024,
    });

    expect(result.ok).toBe(true);
    expect(attachmentStorageMock.createAttachmentSignedUploadUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        originalName: "ios-photo.HEIC",
        mimeType: "image/heic",
      })
    );
  });

  test.each([false, true])("creates context direct-upload target (agent=%s)", async (isAgent) => {
    prismaMock.resource.findUnique.mockResolvedValueOnce({
      id: "card-1",
      projectId: "project-1",
      type: RESOURCE_TYPE_CONTEXT_CARD,
    });
    attachmentStorageMock.createAttachmentSignedUploadUrl.mockResolvedValueOnce({
      storageKey: "context-card/card-1/key-spec.pdf",
      uploadUrl: "https://example.r2/upload",
      method: "PUT",
      headers: { "Content-Type": "application/pdf" },
      expiresInSeconds: 300,
    });

    const result = await createContextAttachmentUploadTarget({
      actorUserId,
      agentAccess: isAgent ? { credentialId: "credential-1", projectId: "project-1", scopes: ["context:write"] } : undefined,
      projectId: "project-1",
      cardId: "card-1",
      name: "spec.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
    });

    expect(result).toEqual({
      ok: true,
      data: {
        upload: {
          storageKey: "context-card/card-1/key-spec.pdf",
          uploadUrl: "https://example.r2/upload",
          method: "PUT",
          headers: { "Content-Type": "application/pdf" },
          expiresInSeconds: 300,
          maxFileSizeBytes: 26214400,
          maxFileSizeLabel: "25MB",
        },
      },
    });
  });

  test("finalizes task direct upload by reading metadata and persisting attachment", async () => {
    prismaMock.task.findUnique.mockResolvedValueOnce({
      id: "task-1",
      projectId: "project-1",
    });
    attachmentStorageMock.readAttachmentStoredFileMetadata.mockResolvedValueOnce({
      sizeBytes: 2048,
      mimeType: "application/pdf",
    });
    prismaMock.taskAttachment.create.mockResolvedValueOnce({
      id: "att-1",
      kind: "file",
      name: "spec.pdf",
      url: null,
      mimeType: "application/pdf",
      sizeBytes: 2048,
    });
    prismaMock.task.update.mockResolvedValueOnce({
      id: "task-1",
    });
    attachmentStorageMock.deleteAttachmentFile.mockResolvedValue(undefined);

    const result = await finalizeTaskAttachmentDirectUpload({
      actorUserId,
      projectId: "project-1",
      taskId: "task-1",
      storageKey: "v1/user-1/project-1/task/task-1/key-spec.pdf",
      name: "spec.pdf",
      mimeType: "application/pdf",
      sizeBytes: 2048,
    });

    expect(result).toEqual({
      ok: true,
      data: {
        id: "att-1",
        commentId: null,
        kind: "file",
        name: "spec.pdf",
        url: null,
        mimeType: "application/pdf",
        sizeBytes: 2048,
        downloadUrl:
          "/api/projects/project-1/tasks/task-1/attachments/att-1/download",
      },
    });
    expect(prismaMock.taskAttachment.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.task.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: { updatedByUserId: actorUserId, updatedByCredentialId: null, updatedByCredentialLabel: null },
      select: { id: true },
    });
    expect(attachmentStorageMock.deleteAttachmentFile).not.toHaveBeenCalled();
    expect(prismaMock.projectActivityEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          domain: "task",
          action: "updated",
          entityId: "task-1",
          payload: {
            actor: { kind: "human", id: actorUserId, displayName: "ada" },
            taskId: "task-1",
            attachment: expect.objectContaining({
              kind: "file",
              mimeType: "application/pdf",
            }),
          },
        }),
      })
    );
  });

  test.each([false, true])("finalizes context direct upload with uploader identity (agent=%s)", async (isAgent) => {
    prismaMock.resource.findUnique.mockResolvedValueOnce({
      id: "card-1",
      projectId: "project-1",
      type: RESOURCE_TYPE_CONTEXT_CARD,
    });
    attachmentStorageMock.readAttachmentStoredFileMetadata.mockResolvedValueOnce({
      sizeBytes: 2048,
      mimeType: "application/pdf",
    });
    prismaMock.resourceAttachment.create.mockResolvedValueOnce({
      id: "att-ctx-1",
      kind: "file",
      name: "spec.pdf",
      url: null,
      mimeType: "application/pdf",
      sizeBytes: 2048,
    });

    const result = await finalizeContextAttachmentDirectUpload({
      actorUserId,
      agentAccess: isAgent ? { credentialId: "credential-1", projectId: "project-1", scopes: ["context:write"] } : undefined,
      projectId: "project-1",
      cardId: "card-1",
      storageKey: "v1/user-1/project-1/context-card/card-1/key-spec.pdf",
      name: "spec.pdf",
      mimeType: "application/pdf",
      sizeBytes: 2048,
    });

    expect(result).toEqual({
      ok: true,
      data: {
        id: "att-ctx-1",
        kind: "file",
        name: "spec.pdf",
        url: null,
        mimeType: "application/pdf",
        sizeBytes: 2048,
        downloadUrl:
          "/api/projects/project-1/context-cards/card-1/attachments/att-ctx-1/download",
      },
    });
    expect(prismaMock.resourceAttachment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        uploadedByUserId: actorUserId,
        uploadedByCredentialId: isAgent ? "credential-1" : null,
        uploadedByKind: isAgent ? "agent" : "human",
        uploadedByDisplayNameSnapshot: isAgent ? "TellmetrY agent" : "ada",
      }),
    }));
    expect(attachmentStorageMock.deleteAttachmentFile).not.toHaveBeenCalled();
  });

  test.each(["scope", "project", "viewer", "card", "key", "revoked", "missing credential"])("rejects unauthorized context upload: %s", async (reason) => {
    prismaMock.resource.findUnique.mockResolvedValue({ id: "card-1", projectId: reason === "card" ? "other-project" : "project-1", type: RESOURCE_TYPE_CONTEXT_CARD });
    if (reason === "viewer") prismaMock.project.findFirst.mockResolvedValueOnce({ ownerId: "someone-else", memberships: [{ role: "viewer" }] });
    if (reason === "revoked") prismaMock.apiCredential.findFirst.mockResolvedValueOnce({ id: "credential-1", projectId: "project-1", label: "Agent", revokedAt: new Date(), expiresAt: null });
    if (reason === "missing credential") prismaMock.apiCredential.findFirst.mockResolvedValueOnce(null);
    const result = await finalizeContextAttachmentDirectUpload({
      actorUserId, projectId: "project-1", cardId: "card-1",
      storageKey: reason === "key" ? "v1/other-user/project-1/context-card/card-1/spec.pdf" : "v1/user-1/project-1/context-card/card-1/spec.pdf",
      name: "spec.pdf", mimeType: "application/pdf", sizeBytes: 2048,
      agentAccess: { credentialId: "credential-1", projectId: reason === "project" ? "other-project" : "project-1", scopes: reason === "scope" ? ["context:read"] : ["context:write"] },
    });
    expect(result).toMatchObject({ ok: false, status: ["card", "project"].includes(reason) ? 404 : reason === "key" ? 400 : 403 });
    expect(prismaMock.resourceAttachment.create).not.toHaveBeenCalled();
    expect(attachmentStorageMock.readAttachmentStoredFileMetadata).not.toHaveBeenCalled();
  });

  test("attributes draft context links and files to the agent credential", async () => {
    attachmentStorageMock.saveAttachmentFile.mockResolvedValueOnce({ storageKey: "stored", originalName: "notes.txt", mimeType: "text/plain", sizeBytes: 5 });
    await createContextAttachmentsFromDraft({ actorUserId, projectId: "project-1", cardId: "card-1", db: prismaMock as never,
      links: [{ name: "Spec", url: "https://example.com" }], files: [new File(["notes"], "notes.txt", { type: "text/plain" })],
      uploaderCredentialId: "credential-1", uploaderDisplayNameSnapshot: "TellmetrY agent" });
    const identity = { uploadedByUserId: actorUserId, uploadedByCredentialId: "credential-1", uploadedByKind: "agent", uploadedByDisplayNameSnapshot: "TellmetrY agent" };
    expect(prismaMock.resourceAttachment.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining(identity)] });
    expect(prismaMock.resourceAttachment.create).toHaveBeenCalledWith({ data: expect.objectContaining(identity) });
  });
  test.each(["form", "direct"])("keeps a %s comment upload out of project activity until binding", async (mode) => {
    prismaMock.task.findUnique.mockResolvedValue({ id: "task-1", projectId: "project-1" });
    const stored = { storageKey: "v1/user-1/project-1/task/task-1/draft.txt", originalName: "draft.txt", mimeType: "text/plain", sizeBytes: 5 };
    attachmentStorageMock.saveAttachmentFile.mockResolvedValue(stored);
    attachmentStorageMock.readAttachmentStoredFileMetadata.mockResolvedValue(stored);
    prismaMock.taskAttachment.create.mockResolvedValue({ id: "draft", commentId: null, kind: "file", name: "draft.txt", mimeType: "text/plain", sizeBytes: 5 });
    const formData = new FormData();
    formData.set("kind", "file"); formData.set("isCommentDraft", "true");
    formData.set("file", new File(["draft"], "draft.txt", { type: "text/plain" }));
    const input = { actorUserId, projectId: "project-1", taskId: "task-1" };
    const result = mode === "form"
      ? await createTaskAttachmentFromForm({ ...input, formData })
      : await finalizeTaskAttachmentDirectUpload({ ...input, ...stored, name: "draft.txt", isCommentDraft: true });
    expect(result.ok).toBe(true);
    expect(prismaMock.taskAttachment.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ isCommentDraft: true }) }));
    expect(prismaMock.projectActivityEvent.create).not.toHaveBeenCalled();
    expect(prismaMock.project.update).not.toHaveBeenCalled();
    expect(prismaMock.task.update).not.toHaveBeenCalled();
  });

  test("deleting an abandoned comment upload does not emit a task attachment event", async () => {
    prismaMock.taskAttachment.findUnique.mockResolvedValue({ id: "draft", kind: "file", storageKey: null, isCommentDraft: true, commentId: null, uploadedByUserId: actorUserId, task: { id: "task-1", projectId: "project-1" } });
    const result = await deleteTaskAttachmentForProject({ actorUserId, projectId: "project-1", taskId: "task-1", attachmentId: "draft" });
    expect(result.ok).toBe(true);
    expect(prismaMock.taskAttachment.delete).toHaveBeenCalled();
    expect(prismaMock.projectActivityEvent.create).not.toHaveBeenCalled();
    expect(prismaMock.project.update).not.toHaveBeenCalled();
  });

  test.each([actorUserId, "other-uploader"])("authorizes draft downloads only for their uploader (%s)", async (uploader) => {
    prismaMock.taskAttachment.findUnique.mockResolvedValue({ kind: "file", name: "draft.txt", mimeType: "text/plain", storageKey: `v1/${uploader}/project-1/task/task-1/draft.txt`, uploadedByUserId: uploader, isCommentDraft: true, task: { id: "task-1", projectId: "project-1" } });
    attachmentStorageMock.getAttachmentDownloadUrl.mockResolvedValue("https://storage.example/draft");
    const result = await getTaskAttachmentDownload({ actorUserId, projectId: "project-1", taskId: "task-1", attachmentId: "draft", disposition: "inline" });
    expect(result.ok).toBe(uploader === actorUserId);
    if (uploader !== actorUserId) {
      expect(result).toMatchObject({ status: 404 });
      expect(attachmentStorageMock.getAttachmentDownloadUrl).not.toHaveBeenCalled();
    }
  });

  test("rejects non-boolean direct-upload draft flags", async () => {
    const result = await finalizeTaskAttachmentDirectUpload({ actorUserId, projectId: "project-1", taskId: "task-1", storageKey: "key", name: "draft.txt", mimeType: "text/plain", sizeBytes: 5, isCommentDraft: "true" });
    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(prismaMock.taskAttachment.create).not.toHaveBeenCalled();
  });

});
