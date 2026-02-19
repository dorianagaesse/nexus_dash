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
}

async function readApiError(response: Response, fallback: string): Promise<string> {
  const payload = (await response.json().catch(() => null)) as
    | { error?: unknown }
    | null;

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
}: UploadFileDirectInput<TAttachment>): Promise<TAttachment> {
  let uploadedStorageKey: string | null = null;
  let finalized = false;

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
  const uploadTargetResponse = await fetch(uploadTargetUrl, {
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

  if (!uploadTargetResponse.ok) {
    throw new Error(await readApiError(uploadTargetResponse, fallbackErrorMessage));
  }

    const uploadTargetPayload =
      (await uploadTargetResponse.json()) as DirectUploadTargetResponse;

    if (!uploadTargetPayload.upload?.storageKey || !uploadTargetPayload.upload?.uploadUrl) {
      throw new Error(fallbackErrorMessage);
    }

    uploadedStorageKey = uploadTargetPayload.upload.storageKey;

    const uploadResponse = await fetch(uploadTargetPayload.upload.uploadUrl, {
      method: uploadTargetPayload.upload.method,
      headers: uploadTargetPayload.upload.headers,
      body: file,
    });

    if (!uploadResponse.ok) {
      throw new Error(fallbackErrorMessage);
    }

    const finalizeResponse = await fetch(finalizeUrl, {
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

    if (!finalizeResponse.ok) {
      await cleanupUploadedFile(uploadTargetPayload.upload.storageKey);
      throw new Error(await readApiError(finalizeResponse, fallbackErrorMessage));
    }

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
