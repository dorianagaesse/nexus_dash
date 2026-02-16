import { beforeEach, describe, expect, test, vi } from "vitest";

const attachmentServiceMock = vi.hoisted(() => ({
  createContextAttachmentFromForm: vi.fn(),
  deleteContextAttachmentForProject: vi.fn(),
  getContextAttachmentDownload: vi.fn(),
}));

vi.mock("@/lib/services/project-attachment-service", () => ({
  createContextAttachmentFromForm: attachmentServiceMock.createContextAttachmentFromForm,
  deleteContextAttachmentForProject:
    attachmentServiceMock.deleteContextAttachmentForProject,
  getContextAttachmentDownload: attachmentServiceMock.getContextAttachmentDownload,
}));

import { POST as postAttachment } from "@/app/api/projects/[projectId]/context-cards/[cardId]/attachments/route";
import { DELETE as deleteAttachment } from "@/app/api/projects/[projectId]/context-cards/[cardId]/attachments/[attachmentId]/route";
import { GET as downloadAttachment } from "@/app/api/projects/[projectId]/context-cards/[cardId]/attachments/[attachmentId]/download/route";

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("context card attachment routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("POST returns 400 when route params are missing", async () => {
    const request = new Request(
      "http://localhost/api/projects/p1/context-cards//attachments",
      {
        method: "POST",
        body: new FormData(),
      }
    );

    const response = await postAttachment(request as never, {
      params: { projectId: "p1", cardId: "" },
    });

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({
      error: "Missing route parameters",
    });
    expect(attachmentServiceMock.createContextAttachmentFromForm).not.toHaveBeenCalled();
  });

  test("POST returns 400 for invalid form payload", async () => {
    const request = new Request(
      "http://localhost/api/projects/p1/context-cards/c1/attachments",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "link" }),
      }
    );

    const response = await postAttachment(request as never, {
      params: { projectId: "p1", cardId: "c1" },
    });

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({
      error: "Invalid form payload",
    });
    expect(attachmentServiceMock.createContextAttachmentFromForm).not.toHaveBeenCalled();
  });

  test("POST creates context card attachment through service", async () => {
    attachmentServiceMock.createContextAttachmentFromForm.mockResolvedValueOnce({
      ok: true,
      data: {
        id: "att-1",
        kind: "link",
        name: "Specs",
        url: "https://example.com/specs",
        mimeType: null,
        sizeBytes: null,
        downloadUrl: null,
      },
    });

    const formData = new FormData();
    formData.set("kind", "link");
    formData.set("name", "Specs");
    formData.set("url", "https://example.com/specs");

    const request = new Request(
      "http://localhost/api/projects/p1/context-cards/c1/attachments",
      {
        method: "POST",
        body: formData,
      }
    );

    const response = await postAttachment(request as never, {
      params: { projectId: "p1", cardId: "c1" },
    });

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({
      attachment: {
        id: "att-1",
        kind: "link",
        name: "Specs",
        url: "https://example.com/specs",
        mimeType: null,
        sizeBytes: null,
        downloadUrl: null,
      },
    });
    expect(attachmentServiceMock.createContextAttachmentFromForm).toHaveBeenCalledTimes(1);
    expect(attachmentServiceMock.createContextAttachmentFromForm).toHaveBeenCalledWith({
      projectId: "p1",
      cardId: "c1",
      formData: expect.any(FormData),
    });
  });

  test("POST maps service errors", async () => {
    attachmentServiceMock.createContextAttachmentFromForm.mockResolvedValueOnce({
      ok: false,
      status: 404,
      error: "Context card not found",
    });

    const request = new Request(
      "http://localhost/api/projects/p1/context-cards/c1/attachments",
      {
        method: "POST",
        body: new FormData(),
      }
    );

    const response = await postAttachment(request as never, {
      params: { projectId: "p1", cardId: "c1" },
    });

    expect(response.status).toBe(404);
    await expect(readJson(response)).resolves.toEqual({
      error: "Context card not found",
    });
  });

  test("DELETE returns 400 when route params are missing", async () => {
    const response = await deleteAttachment(new Request("http://localhost") as never, {
      params: { projectId: "p1", cardId: "c1", attachmentId: "" },
    });

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({
      error: "Missing route parameters",
    });
    expect(attachmentServiceMock.deleteContextAttachmentForProject).not.toHaveBeenCalled();
  });

  test("DELETE removes context card attachment via service", async () => {
    attachmentServiceMock.deleteContextAttachmentForProject.mockResolvedValueOnce({
      ok: true,
      data: { ok: true },
    });

    const response = await deleteAttachment(new Request("http://localhost") as never, {
      params: { projectId: "p1", cardId: "c1", attachmentId: "a1" },
    });

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({ ok: true });
    expect(attachmentServiceMock.deleteContextAttachmentForProject).toHaveBeenCalledWith({
      projectId: "p1",
      cardId: "c1",
      attachmentId: "a1",
    });
  });

  test("DELETE maps service errors", async () => {
    attachmentServiceMock.deleteContextAttachmentForProject.mockResolvedValueOnce({
      ok: false,
      status: 500,
      error: "Failed to delete attachment",
    });

    const response = await deleteAttachment(new Request("http://localhost") as never, {
      params: { projectId: "p1", cardId: "c1", attachmentId: "a1" },
    });

    expect(response.status).toBe(500);
    await expect(readJson(response)).resolves.toEqual({
      error: "Failed to delete attachment",
    });
  });

  test("GET download returns 400 when route params are missing", async () => {
    const response = await downloadAttachment(new Request("http://localhost") as never, {
      params: { projectId: "p1", cardId: "c1", attachmentId: "" },
    });

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({
      error: "Missing route parameters",
    });
    expect(attachmentServiceMock.getContextAttachmentDownload).not.toHaveBeenCalled();
  });

  test("GET download returns file body and headers", async () => {
    attachmentServiceMock.getContextAttachmentDownload.mockResolvedValueOnce({
      ok: true,
      data: {
        contentType: "application/pdf",
        contentDisposition: "inline; filename*=UTF-8''spec.pdf",
        content: new Uint8Array([37, 80, 68, 70]),
      },
    });

    const response = await downloadAttachment(
      new Request(
        "http://localhost/api/projects/p1/context-cards/c1/attachments/a1/download?disposition=inline"
      ) as never,
      {
        params: { projectId: "p1", cardId: "c1", attachmentId: "a1" },
      }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toBe(
      "inline; filename*=UTF-8''spec.pdf"
    );
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=60");
    expect(attachmentServiceMock.getContextAttachmentDownload).toHaveBeenCalledWith({
      projectId: "p1",
      cardId: "c1",
      attachmentId: "a1",
      disposition: "inline",
    });

    const body = new Uint8Array(await response.arrayBuffer());
    expect(body).toEqual(new Uint8Array([37, 80, 68, 70]));
  });

  test("GET download defaults to attachment disposition and maps service errors", async () => {
    attachmentServiceMock.getContextAttachmentDownload.mockResolvedValueOnce({
      ok: false,
      status: 404,
      error: "File attachment not found",
    });

    const response = await downloadAttachment(
      new Request(
        "http://localhost/api/projects/p1/context-cards/c1/attachments/a1/download"
      ) as never,
      {
        params: { projectId: "p1", cardId: "c1", attachmentId: "a1" },
      }
    );

    expect(response.status).toBe(404);
    await expect(readJson(response)).resolves.toEqual({
      error: "File attachment not found",
    });
    expect(attachmentServiceMock.getContextAttachmentDownload).toHaveBeenCalledWith({
      projectId: "p1",
      cardId: "c1",
      attachmentId: "a1",
      disposition: "attachment",
    });
  });
});
