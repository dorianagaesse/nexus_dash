import { afterEach, describe, expect, test, vi } from "vitest";

import {
  uploadFileAttachmentDirect,
  uploadFilesDirectInBackground,
} from "@/lib/direct-upload-client";

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
      "Could not upload file attachment. Direct upload request failed before reaching storage for https://nexus-dash-wheat.vercel.app. This is commonly caused by missing Cloudflare R2 CORS rules. Configure the bucket to allow this origin with PUT/GET/HEAD methods and Content-Type headers."
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/projects/p1/tasks/t1/attachments/direct/cleanup",
      expect.objectContaining({
        method: "POST",
      })
    );
  });

  test("reports deterministic progress and failures for background direct uploads", async () => {
    const progressSnapshots: Array<{
      phase: "uploading" | "done" | "failed";
      total: number;
      completed: number;
      failed: number;
    }> = [];

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("/upload-url/success")) {
        return new Response(
          JSON.stringify({
            upload: {
              storageKey: "task/p1/success.pdf",
              uploadUrl: "https://r2.example/success.pdf",
              method: "PUT",
              headers: {
                "Content-Type": "application/pdf",
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (url.includes("/upload-url/fail")) {
        return new Response(
          JSON.stringify({
            upload: {
              storageKey: "task/p1/fail.pdf",
              uploadUrl: "https://r2.example/fail.pdf",
              method: "PUT",
              headers: {
                "Content-Type": "application/pdf",
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (url === "https://r2.example/success.pdf") {
        return new Response(null, { status: 200 });
      }

      if (url === "https://r2.example/fail.pdf") {
        return new Response(null, { status: 500 });
      }

      if (url.includes("/finalize/success")) {
        return new Response(
          JSON.stringify({ attachment: { id: "att-success" } }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (url.includes("/cleanup/fail")) {
        return new Response(null, { status: 204 });
      }

      return new Response(null, { status: 404 });
    });

    vi.stubGlobal("fetch", fetchMock);

    await uploadFilesDirectInBackground({
      uploads: [
        {
          file: new File(["1"], "success.pdf", { type: "application/pdf" }),
          uploadTargetUrl: "/upload-url/success",
          finalizeUrl: "/finalize/success",
          cleanupUrl: "/cleanup/success",
          fallbackErrorMessage: "upload-failed-success",
        },
        {
          file: new File(["2"], "fail.pdf", { type: "application/pdf" }),
          uploadTargetUrl: "/upload-url/fail",
          finalizeUrl: "/finalize/fail",
          cleanupUrl: "/cleanup/fail",
          fallbackErrorMessage: "upload-failed-fail",
        },
      ],
      onProgress: (progress) => {
        progressSnapshots.push(progress);
      },
    });

    expect(progressSnapshots[0]).toEqual({
      phase: "uploading",
      total: 2,
      completed: 0,
      failed: 0,
    });
    expect(
      progressSnapshots.some(
        (snapshot) =>
          snapshot.phase === "uploading" &&
          snapshot.completed > 0 &&
          snapshot.completed < snapshot.total
      )
    ).toBe(true);
    expect(progressSnapshots.at(-1)).toEqual({
      phase: "failed",
      total: 2,
      completed: 2,
      failed: 1,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/finalize/success",
      expect.objectContaining({ method: "POST" })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/cleanup/fail",
      expect.objectContaining({ method: "POST" })
    );
  });
});
