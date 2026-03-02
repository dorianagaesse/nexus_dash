interface DirectUploadTargetPayload {
  storageKey: string;
  uploadUrl: string;
  method: "PUT";
  headers: Record<string, string>;
}

interface DirectUploadTargetResponse {
  upload: DirectUploadTargetPayload;
}

interface UploadFileDirectInput<TAttachment> {
  file: File;
  uploadTargetUrl: string;
  finalizeUrl: string;
  cleanupUrl?: string;
  fallbackErrorMessage: string;
  onStageChange?: (event: Omit<DirectUploadStageEvent, "file">) => void;
}

export interface DirectUploadBackgroundProgress {
  phase: "uploading" | "done" | "failed";
  total: number;
  completed: number;
  failed: number;
}

export interface DirectUploadBackgroundItem {
  file: File;
  uploadTargetUrl: string;
  finalizeUrl: string;
  cleanupUrl?: string;
  fallbackErrorMessage: string;
}

export type DirectUploadStage = "target" | "put" | "finalize";

export interface DirectUploadStageEvent {
  file: File;
  stage: DirectUploadStage;
  status: "start" | "done" | "failed";
  durationMs?: number;
  error?: unknown;
}

interface UploadFilesDirectBackgroundInput<TAttachment> {
  uploads: DirectUploadBackgroundItem[];
  concurrency?: number;
  onProgress?: (progress: DirectUploadBackgroundProgress) => void;
  onItemError?: (error: unknown, file: File) => void;
  onItemSuccess?: (attachment: TAttachment, file: File) => void;
  onStageChange?: (event: DirectUploadStageEvent) => void;
}

function buildCorsPreflightErrorMessage(fallbackErrorMessage: string): string {
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "this application origin";

  return `${fallbackErrorMessage} Direct upload request failed before reaching storage for ${origin}. This is commonly caused by missing Cloudflare R2 CORS rules. Configure the bucket to allow this origin with PUT/GET/HEAD methods and Content-Type headers.`;
}

async function readApiError(
  response: Response,
  fallback: string
): Promise<string> {
  const payload = (await response.json().catch(() => null)) as {
    error?: unknown;
  } | null;

  if (payload && typeof payload.error === "string" && payload.error.trim()) {
    return payload.error;
  }

  return fallback;
}

export async function uploadFileAttachmentDirect<TAttachment>({
  file,
  uploadTargetUrl,
  finalizeUrl,
  cleanupUrl,
  fallbackErrorMessage,
  onStageChange,
}: UploadFileDirectInput<TAttachment>): Promise<TAttachment> {
  let uploadedStorageKey: string | null = null;
  let finalized = false;

  const runStage = async <TResult>(
    stage: DirectUploadStage,
    callback: () => Promise<TResult>
  ): Promise<TResult> => {
    const stageStartedAt = performance.now();
    onStageChange?.({
      stage,
      status: "start",
    });
    try {
      const result = await callback();
      onStageChange?.({
        stage,
        status: "done",
        durationMs: Math.max(0, performance.now() - stageStartedAt),
      });
      return result;
    } catch (error) {
      onStageChange?.({
        stage,
        status: "failed",
        durationMs: Math.max(0, performance.now() - stageStartedAt),
        error,
      });
      throw error;
    }
  };

  async function cleanupUploadedFile(storageKey: string): Promise<void> {
    if (!cleanupUrl) {
      return;
    }

    await fetch(cleanupUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        storageKey,
      }),
    }).catch(() => null);
  }

  try {
    const uploadTargetResponse = await runStage("target", async () => {
      const response = await fetch(uploadTargetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        }),
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, fallbackErrorMessage));
      }
      return response;
    });

    const uploadTargetPayload =
      (await uploadTargetResponse.json()) as DirectUploadTargetResponse;

    if (
      !uploadTargetPayload.upload?.storageKey ||
      !uploadTargetPayload.upload?.uploadUrl
    ) {
      throw new Error(fallbackErrorMessage);
    }

    uploadedStorageKey = uploadTargetPayload.upload.storageKey;

    try {
      await runStage("put", async () => {
        const response = await fetch(uploadTargetPayload.upload.uploadUrl, {
          method: uploadTargetPayload.upload.method,
          headers: uploadTargetPayload.upload.headers,
          body: file,
        });
        if (!response.ok) {
          throw new Error(fallbackErrorMessage);
        }
        return response;
      });
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error(buildCorsPreflightErrorMessage(fallbackErrorMessage));
      }
      throw error;
    }

    const finalizeResponse = await runStage("finalize", async () => {
      const response = await fetch(finalizeUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          storageKey: uploadTargetPayload.upload.storageKey,
          name: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        }),
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, fallbackErrorMessage));
      }
      return response;
    });

    const finalizePayload = (await finalizeResponse.json()) as {
      attachment?: TAttachment;
    };

    if (!finalizePayload.attachment) {
      await cleanupUploadedFile(uploadTargetPayload.upload.storageKey);
      throw new Error(fallbackErrorMessage);
    }

    finalized = true;
    return finalizePayload.attachment;
  } catch (error) {
    if (uploadedStorageKey && !finalized) {
      await cleanupUploadedFile(uploadedStorageKey);
    }
    throw error;
  }
}

export async function uploadFilesDirectInBackground<TAttachment = unknown>({
  uploads,
  concurrency = 3,
  onProgress,
  onItemError,
  onItemSuccess,
  onStageChange,
}: UploadFilesDirectBackgroundInput<TAttachment>): Promise<DirectUploadBackgroundProgress> {
  const total = uploads.length;
  let completed = 0;
  let failed = 0;
  let cursor = 0;
  const workerCount = Math.min(
    total,
    Math.max(1, Math.floor(Number.isFinite(concurrency) ? concurrency : 3))
  );

  const initialProgress: DirectUploadBackgroundProgress = {
    phase: "uploading",
    total,
    completed,
    failed,
  };
  onProgress?.(initialProgress);

  const runWorker = async () => {
    while (true) {
      const nextIndex = cursor;
      cursor += 1;

      if (nextIndex >= uploads.length) {
        return;
      }

      const upload = uploads[nextIndex];
      try {
        const attachment = await uploadFileAttachmentDirect<TAttachment>({
          file: upload.file,
          uploadTargetUrl: upload.uploadTargetUrl,
          finalizeUrl: upload.finalizeUrl,
          cleanupUrl: upload.cleanupUrl,
          fallbackErrorMessage: upload.fallbackErrorMessage,
          onStageChange: (event) => {
            onStageChange?.({
              file: upload.file,
              ...event,
            });
          },
        });
        onItemSuccess?.(attachment, upload.file);
      } catch (error) {
        failed += 1;
        onItemError?.(error, upload.file);
      } finally {
        completed += 1;
        onProgress?.({
          phase: "uploading",
          total,
          completed,
          failed,
        });
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

  const finalProgress: DirectUploadBackgroundProgress = {
    phase: failed > 0 ? "failed" : "done",
    total,
    completed,
    failed,
  };
  onProgress?.(finalProgress);

  return finalProgress;
}
