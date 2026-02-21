import { beforeEach, describe, expect, test, vi } from "vitest";

import { RESOURCE_TYPE_CONTEXT_CARD } from "@/lib/resource-type";
import { AttachmentStorageUnavailableError } from "@/lib/storage/errors";

const prismaMock = vi.hoisted(() => ({
  task: {
    findUnique: vi.fn(),
  },
  resource: {
    findUnique: vi.fn(),
  },
  taskAttachment: {
    create: vi.fn(),
  },
  resourceAttachment: {
    create: vi.fn(),
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

const actorServiceMock = vi.hoisted(() => ({
  resolveActorUserId: vi.fn(),
}));

const projectAuthorizationMock = vi.hoisted(() => ({
  hasProjectAccess: vi.fn(),
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

vi.mock("@/lib/services/actor-service", () => ({
  resolveActorUserId: actorServiceMock.resolveActorUserId,
}));

vi.mock("@/lib/services/project-authorization-service", () => ({
  hasProjectAccess: projectAuthorizationMock.hasProjectAccess,
}));

import {
  createContextAttachmentUploadTarget,
  createContextAttachmentFromForm,
  createTaskAttachmentUploadTarget,
  createTaskAttachmentFromForm,
  finalizeContextAttachmentDirectUpload,
  finalizeTaskAttachmentDirectUpload,
} from "@/lib/services/project-attachment-service";

describe("project-attachment-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actorServiceMock.resolveActorUserId.mockResolvedValue("user-1");
    projectAuthorizationMock.hasProjectAccess.mockResolvedValue(true);
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

  test("creates task direct-upload target when storage provider supports signed uploads", async () => {
    prismaMock.task.findUnique.mockResolvedValueOnce({
      id: "task-1",
      projectId: "project-1",
    });
    attachmentStorageMock.createAttachmentSignedUploadUrl.mockResolvedValueOnce({
      storageKey: "task/user-1/task-1/key-spec.pdf",
      uploadUrl: "https://example.r2/upload",
      method: "PUT",
      headers: { "Content-Type": "application/pdf" },
      expiresInSeconds: 300,
    });

    const result = await createTaskAttachmentUploadTarget({
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
          storageKey: "task/user-1/task-1/key-spec.pdf",
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

  test("creates context direct-upload target when storage provider supports signed uploads", async () => {
    prismaMock.resource.findUnique.mockResolvedValueOnce({
      id: "card-1",
      projectId: "project-1",
      type: RESOURCE_TYPE_CONTEXT_CARD,
    });
    attachmentStorageMock.createAttachmentSignedUploadUrl.mockResolvedValueOnce({
      storageKey: "context-card/user-1/card-1/key-spec.pdf",
      uploadUrl: "https://example.r2/upload",
      method: "PUT",
      headers: { "Content-Type": "application/pdf" },
      expiresInSeconds: 300,
    });

    const result = await createContextAttachmentUploadTarget({
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
          storageKey: "context-card/user-1/card-1/key-spec.pdf",
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

    const result = await finalizeTaskAttachmentDirectUpload({
      projectId: "project-1",
      taskId: "task-1",
      storageKey: "task/user-1/task-1/key-spec.pdf",
      name: "spec.pdf",
      mimeType: "application/pdf",
      sizeBytes: 2048,
    });

    expect(result).toEqual({
      ok: true,
      data: {
        id: "att-1",
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
    expect(attachmentStorageMock.deleteAttachmentFile).not.toHaveBeenCalled();
  });

  test("finalizes context direct upload by reading metadata and persisting attachment", async () => {
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
      projectId: "project-1",
      cardId: "card-1",
      storageKey: "context-card/user-1/card-1/key-spec.pdf",
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
    expect(prismaMock.resourceAttachment.create).toHaveBeenCalledTimes(1);
    expect(attachmentStorageMock.deleteAttachmentFile).not.toHaveBeenCalled();
  });
});
