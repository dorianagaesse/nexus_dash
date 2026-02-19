import { beforeEach, describe, expect, test, vi } from "vitest";

const attachmentServiceMock = vi.hoisted(() => ({
  createTaskAttachmentFromForm: vi.fn(),
  createTaskAttachmentUploadTarget: vi.fn(),
  finalizeTaskAttachmentDirectUpload: vi.fn(),
  deleteTaskAttachmentForProject: vi.fn(),
  getTaskAttachmentDownload: vi.fn(),
}));

vi.mock("@/lib/services/project-attachment-service", () => ({
  createTaskAttachmentFromForm: attachmentServiceMock.createTaskAttachmentFromForm,
  createTaskAttachmentUploadTarget:
    attachmentServiceMock.createTaskAttachmentUploadTarget,
  finalizeTaskAttachmentDirectUpload:
    attachmentServiceMock.finalizeTaskAttachmentDirectUpload,
  deleteTaskAttachmentForProject: attachmentServiceMock.deleteTaskAttachmentForProject,
  getTaskAttachmentDownload: attachmentServiceMock.getTaskAttachmentDownload,
}));

import { POST as postAttachment } from "@/app/api/projects/[projectId]/tasks/[taskId]/attachments/route";
import { POST as postAttachmentUploadUrl } from "@/app/api/projects/[projectId]/tasks/[taskId]/attachments/upload-url/route";
import { POST as postAttachmentDirectFinalize } from "@/app/api/projects/[projectId]/tasks/[taskId]/attachments/direct/route";
import { DELETE as deleteAttachment } from "@/app/api/projects/[projectId]/tasks/[taskId]/attachments/[attachmentId]/route";
import { GET as downloadAttachment } from "@/app/api/projects/[projectId]/tasks/[taskId]/attachments/[attachmentId]/download/route";

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("task attachment routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("POST returns 400 when route params are missing", async () => {
    const request = new Request("http://localhost/api/projects/p1/tasks//attachments", {
      method: "POST",
      body: new FormData(),
    });

    const response = await postAttachment(request as never, {
      params: { projectId: "p1", taskId: "" },
    });

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({
      error: "Missing route parameters",
    });
    expect(attachmentServiceMock.createTaskAttachmentFromForm).not.toHaveBeenCalled();
  });

  test("POST returns 400 for invalid form payload", async () => {
    const request = new Request("http://localhost/api/projects/p1/tasks/t1/attachments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "link" }),
    });

    const response = await postAttachment(request as never, {
      params: { projectId: "p1", taskId: "t1" },
    });

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({
      error: "Invalid form payload",
    });
    expect(attachmentServiceMock.createTaskAttachmentFromForm).not.toHaveBeenCalled();
  });

  test("POST creates task attachment through service", async () => {
    attachmentServiceMock.createTaskAttachmentFromForm.mockResolvedValueOnce({
      ok: true,
      data: {
        id: "att-1",
        kind: "link",
        name: "Docs",
        url: "https://example.com",
        mimeType: null,
        sizeBytes: null,
        downloadUrl: null,
      },
    });

    const formData = new FormData();
    formData.set("kind", "link");
    formData.set("name", "Docs");
    formData.set("url", "https://example.com");

    const request = new Request("http://localhost/api/projects/p1/tasks/t1/attachments", {
      method: "POST",
      body: formData,
    });

    const response = await postAttachment(request as never, {
      params: { projectId: "p1", taskId: "t1" },
    });

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({
      attachment: {
        id: "att-1",
        kind: "link",
        name: "Docs",
        url: "https://example.com",
        mimeType: null,
        sizeBytes: null,
        downloadUrl: null,
      },
    });
    expect(attachmentServiceMock.createTaskAttachmentFromForm).toHaveBeenCalledTimes(1);

    const call = attachmentServiceMock.createTaskAttachmentFromForm.mock.calls[0][0];
    expect(call.projectId).toBe("p1");
    expect(call.taskId).toBe("t1");
    expect(call.formData).toBeInstanceOf(FormData);
  });

  test("POST maps service errors", async () => {
    attachmentServiceMock.createTaskAttachmentFromForm.mockResolvedValueOnce({
      ok: false,
      status: 404,
      error: "Task not found",
    });

    const request = new Request("http://localhost/api/projects/p1/tasks/t1/attachments", {
      method: "POST",
      body: new FormData(),
    });

    const response = await postAttachment(request as never, {
      params: { projectId: "p1", taskId: "t1" },
    });

    expect(response.status).toBe(404);
    await expect(readJson(response)).resolves.toEqual({ error: "Task not found" });
  });

  test("POST upload-url returns 400 when route params are missing", async () => {
    const request = new Request(
      "http://localhost/api/projects/p1/tasks//attachments/upload-url",
      {
        method: "POST",
        body: JSON.stringify({
          name: "spec.pdf",
          mimeType: "application/pdf",
          sizeBytes: 123,
        }),
      }
    );

    const response = await postAttachmentUploadUrl(request as never, {
      params: { projectId: "p1", taskId: "" },
    });

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({
      error: "Missing route parameters",
    });
  });

  test("POST upload-url creates signed target through service", async () => {
    attachmentServiceMock.createTaskAttachmentUploadTarget.mockResolvedValueOnce({
      ok: true,
      data: {
        upload: {
          storageKey: "task/t1/key-file.pdf",
          uploadUrl: "https://example.r2/upload",
          method: "PUT",
          headers: { "Content-Type": "application/pdf" },
          expiresInSeconds: 300,
          maxFileSizeBytes: 26214400,
          maxFileSizeLabel: "25MB",
        },
      },
    });

    const request = new Request(
      "http://localhost/api/projects/p1/tasks/t1/attachments/upload-url",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "spec.pdf",
          mimeType: "application/pdf",
          sizeBytes: 123,
        }),
      }
    );

    const response = await postAttachmentUploadUrl(request as never, {
      params: { projectId: "p1", taskId: "t1" },
    });

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({
      upload: {
        storageKey: "task/t1/key-file.pdf",
        uploadUrl: "https://example.r2/upload",
        method: "PUT",
        headers: { "Content-Type": "application/pdf" },
        expiresInSeconds: 300,
        maxFileSizeBytes: 26214400,
        maxFileSizeLabel: "25MB",
      },
    });
    expect(attachmentServiceMock.createTaskAttachmentUploadTarget).toHaveBeenCalledWith({
      projectId: "p1",
      taskId: "t1",
      name: "spec.pdf",
      mimeType: "application/pdf",
      sizeBytes: 123,
    });
  });

  test("POST direct finalize maps service errors", async () => {
    attachmentServiceMock.finalizeTaskAttachmentDirectUpload.mockResolvedValueOnce({
      ok: false,
      status: 404,
      error: "Uploaded file not found",
    });

    const request = new Request(
      "http://localhost/api/projects/p1/tasks/t1/attachments/direct",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          storageKey: "task/t1/missing.pdf",
          name: "missing.pdf",
          mimeType: "application/pdf",
          sizeBytes: 123,
        }),
      }
    );

    const response = await postAttachmentDirectFinalize(request as never, {
      params: { projectId: "p1", taskId: "t1" },
    });

    expect(response.status).toBe(404);
    await expect(readJson(response)).resolves.toEqual({
      error: "Uploaded file not found",
    });
  });

  test("DELETE returns 400 when route params are missing", async () => {
    const response = await deleteAttachment(new Request("http://localhost") as never, {
      params: { projectId: "p1", taskId: "t1", attachmentId: "" },
    });

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({
      error: "Missing route parameters",
    });
    expect(attachmentServiceMock.deleteTaskAttachmentForProject).not.toHaveBeenCalled();
  });

  test("DELETE removes task attachment via service", async () => {
    attachmentServiceMock.deleteTaskAttachmentForProject.mockResolvedValueOnce({
      ok: true,
      data: { ok: true },
    });

    const response = await deleteAttachment(new Request("http://localhost") as never, {
      params: { projectId: "p1", taskId: "t1", attachmentId: "a1" },
    });

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({ ok: true });
    expect(attachmentServiceMock.deleteTaskAttachmentForProject).toHaveBeenCalledWith({
      projectId: "p1",
      taskId: "t1",
      attachmentId: "a1",
    });
  });

  test("DELETE maps service errors", async () => {
    attachmentServiceMock.deleteTaskAttachmentForProject.mockResolvedValueOnce({
      ok: false,
      status: 500,
      error: "Failed to delete attachment",
    });

    const response = await deleteAttachment(new Request("http://localhost") as never, {
      params: { projectId: "p1", taskId: "t1", attachmentId: "a1" },
    });

    expect(response.status).toBe(500);
    await expect(readJson(response)).resolves.toEqual({
      error: "Failed to delete attachment",
    });
  });

  test("GET download returns 400 when route params are missing", async () => {
    const response = await downloadAttachment(new Request("http://localhost") as never, {
      params: { projectId: "p1", taskId: "t1", attachmentId: "" },
    });

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({
      error: "Missing route parameters",
    });
    expect(attachmentServiceMock.getTaskAttachmentDownload).not.toHaveBeenCalled();
  });

  test("GET download returns file body and headers", async () => {
    attachmentServiceMock.getTaskAttachmentDownload.mockResolvedValueOnce({
      ok: true,
      data: {
        mode: "proxy",
        contentType: "text/plain",
        contentDisposition: "attachment; filename*=UTF-8''note.txt",
        content: new Uint8Array([104, 105]),
      },
    });

    const response = await downloadAttachment(
      new Request(
        "http://localhost/api/projects/p1/tasks/t1/attachments/a1/download?disposition=inline"
      ) as never,
      {
        params: { projectId: "p1", taskId: "t1", attachmentId: "a1" },
      }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/plain");
    expect(response.headers.get("Content-Disposition")).toBe(
      "attachment; filename*=UTF-8''note.txt"
    );
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=60");
    expect(attachmentServiceMock.getTaskAttachmentDownload).toHaveBeenCalledWith({
      projectId: "p1",
      taskId: "t1",
      attachmentId: "a1",
      disposition: "inline",
    });

    const body = new Uint8Array(await response.arrayBuffer());
    expect(body).toEqual(new Uint8Array([104, 105]));
  });

  test("GET download redirects when service returns signed url mode", async () => {
    attachmentServiceMock.getTaskAttachmentDownload.mockResolvedValueOnce({
      ok: true,
      data: {
        mode: "redirect",
        redirectUrl: "https://files.example.com/signed/task-a1",
      },
    });

    const response = await downloadAttachment(
      new Request("http://localhost/api/projects/p1/tasks/t1/attachments/a1/download") as never,
      {
        params: { projectId: "p1", taskId: "t1", attachmentId: "a1" },
      }
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://files.example.com/signed/task-a1"
    );
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=60");
  });

  test("GET download defaults to attachment disposition and maps service errors", async () => {
    attachmentServiceMock.getTaskAttachmentDownload.mockResolvedValueOnce({
      ok: false,
      status: 404,
      error: "File attachment not found",
    });

    const response = await downloadAttachment(
      new Request("http://localhost/api/projects/p1/tasks/t1/attachments/a1/download") as never,
      {
        params: { projectId: "p1", taskId: "t1", attachmentId: "a1" },
      }
    );

    expect(response.status).toBe(404);
    await expect(readJson(response)).resolves.toEqual({
      error: "File attachment not found",
    });
    expect(attachmentServiceMock.getTaskAttachmentDownload).toHaveBeenCalledWith({
      projectId: "p1",
      taskId: "t1",
      attachmentId: "a1",
      disposition: "attachment",
    });
  });
});
