import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  download: vi.fn(),
}));
vi.mock("@/lib/auth/api-guard", () => ({
  requireAuthenticatedApiUser: mocks.auth,
}));
vi.mock("@/lib/services/meeting-note-screenshot-service", () => ({
  uploadMeetingScreenshot: mocks.upload,
  deleteMeetingScreenshotDraft: mocks.remove,
  getMeetingScreenshotDownload: mocks.download,
}));
import { POST } from "@/app/api/projects/[projectId]/meeting-notes/attachments/route";
import { DELETE } from "@/app/api/projects/[projectId]/meeting-notes/attachments/[attachmentId]/route";
import { GET } from "@/app/api/projects/[projectId]/meeting-notes/attachments/[attachmentId]/download/route";
const url = "http://localhost/api/projects/p/meeting-notes/attachments";
const props = {
  params: Promise.resolve({ projectId: "p", attachmentId: "image" }),
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ ok: true, userId: "author" });
});
describe("meeting screenshot routes", () => {
  test("requires a human session before reading uploads or files", async () => {
    mocks.auth.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    });
    for (const route of [POST, DELETE, GET])
      expect((await route(new NextRequest(url), props)).status).toBe(401);
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  test("rejects malformed form data and missing files", async () => {
    expect(
      (await POST(new NextRequest(url, { method: "POST", body: "bad" }), props))
        .status
    ).toBe(400);
    expect(
      (
        await POST(
          new NextRequest(url, { method: "POST", body: new FormData() }),
          props
        )
      ).status
    ).toBe(400);
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  test("passes the image and section to the authorized service", async () => {
    mocks.upload.mockResolvedValue({
      ok: true,
      data: { attachment: { id: "image" } },
    });
    const form = new FormData();
    form.set("section", "output");
    form.set("file", new File(["bytes"], "shot.png", { type: "image/png" }));
    const response = await POST(
      new NextRequest(url, { method: "POST", body: form }),
      props
    );
    expect(response.status).toBe(201);
    expect(mocks.upload).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "author",
        projectId: "p",
        section: "output",
        file: expect.any(File),
      })
    );
    mocks.upload.mockResolvedValue({
      ok: false,
      status: 403,
      error: "forbidden",
    });
    expect(
      (await POST(new NextRequest(url, { method: "POST", body: form }), props))
        .status
    ).toBe(403);
  });
  test("streams authenticated images with safe filenames and no cache", async () => {
    mocks.download.mockResolvedValue({
      ok: true,
      data: {
        name: "shot's.png",
        mimeType: "image/png",
        content: Buffer.from("bytes"),
      },
    });
    const response = await GET(
      new NextRequest(`${url}/image/download?disposition=inline`),
      props
    );
    expect(await response.text()).toBe("bytes");
    expect(response.headers.get("content-disposition")).toBe(
      "inline; filename*=UTF-8''shot%27s.png"
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    const attachment = await GET(
      new NextRequest(`${url}/image/download`),
      props
    );
    expect(attachment.headers.get("content-disposition")).toMatch(
      /^attachment;/
    );
    mocks.download.mockResolvedValue({
      ok: false,
      status: 404,
      error: "Screenshot not found",
    });
    expect(
      (await GET(new NextRequest(`${url}/image/download`), props)).status
    ).toBe(404);
  });
  test("maps draft removal success and denial", async () => {
    mocks.remove.mockResolvedValue({ ok: true, data: { ok: true } });
    expect(
      (await DELETE(new NextRequest(url, { method: "DELETE" }), props)).status
    ).toBe(200);
    expect(mocks.remove).toHaveBeenCalledWith({
      actorUserId: "author",
      projectId: "p",
      attachmentId: "image",
    });
    mocks.remove.mockResolvedValue({
      ok: false,
      status: 404,
      error: "Screenshot draft not found",
    });
    expect(
      (await DELETE(new NextRequest(url, { method: "DELETE" }), props)).status
    ).toBe(404);
  });
});
