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
  deleteAttachmentFile: attachmentStorageMock.deleteAttachmentFile,
  getAttachmentDownloadUrl: attachmentStorageMock.getAttachmentDownloadUrl,
  readAttachmentFile: attachmentStorageMock.readAttachmentFile,
}));

vi.mock("@/lib/observability/logger", () => ({
  logServerError: loggerMock.logServerError,
}));

import {
  createContextAttachmentFromForm,
  createTaskAttachmentFromForm,
} from "@/lib/services/project-attachment-service";

describe("project-attachment-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
