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
  fallbackErrorMessage,
}: UploadFileDirectInput<TAttachment>): Promise<TAttachment> {
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
    throw new Error(await readApiError(finalizeResponse, fallbackErrorMessage));
  }

  const finalizePayload = (await finalizeResponse.json()) as {
    attachment?: TAttachment;
  };

  if (!finalizePayload.attachment) {
    throw new Error(fallbackErrorMessage);
  }

  return finalizePayload.attachment;
}
