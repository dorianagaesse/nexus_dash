import { afterEach, describe, expect, test, vi } from "vitest";

import { uploadFileAttachmentDirect } from "@/lib/direct-upload-client";

describe("direct-upload-client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test("maps upload network TypeError to actionable R2 CORS guidance", async () => {
    vi.stubGlobal("window", {
      location: {
        origin: "https://nexus-dash-wheat.vercel.app",
      },
    } as unknown as Window);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            upload: {
              storageKey: "task/p1/file.pdf",
              uploadUrl:
                "https://example.r2.cloudflarestorage.com/bucket/file.pdf",
              method: "PUT",
              headers: {
                "Content-Type": "application/pdf",
              },
            },
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          }
        )
      )
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    vi.stubGlobal("fetch", fetchMock);

    const file = new File(["pdf"], "file.pdf", { type: "application/pdf" });

    await expect(
      uploadFileAttachmentDirect({
        file,
        uploadTargetUrl: "/api/projects/p1/tasks/t1/attachments/upload-url",
        finalizeUrl: "/api/projects/p1/tasks/t1/attachments/direct",
        cleanupUrl: "/api/projects/p1/tasks/t1/attachments/direct/cleanup",
        fallbackErrorMessage: "Could not upload file attachment.",
      })
    ).rejects.toThrow(
      "Could not upload file attachment. Direct upload request failed before reaching storage for https://nexus-dash-wheat.vercel.app. This is commonly caused by missing Cloudflare R2 CORS rules. Configure the bucket to allow this origin with PUT/GET/HEAD/OPTIONS and Content-Type headers."
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/projects/p1/tasks/t1/attachments/direct/cleanup",
      expect.objectContaining({
        method: "POST",
      })
    );
  });
});
