export const ATTACHMENT_STORAGE_UNAVAILABLE_ERROR_CODE =
  "ATTACHMENT_STORAGE_UNAVAILABLE";

interface AttachmentStorageUnavailableErrorOptions {
  cause?: unknown;
  filesystemCode?: string;
  filesystemPath?: string;
}

export class AttachmentStorageUnavailableError extends Error {
  readonly code = ATTACHMENT_STORAGE_UNAVAILABLE_ERROR_CODE;

  readonly filesystemCode: string | null;

  readonly filesystemPath: string | null;

  constructor(
    message: string,
    options: AttachmentStorageUnavailableErrorOptions = {}
  ) {
    super(message);
    this.name = "AttachmentStorageUnavailableError";
    this.filesystemCode = options.filesystemCode ?? null;
    this.filesystemPath = options.filesystemPath ?? null;

    if (options.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

export function isAttachmentStorageUnavailableError(
  error: unknown
): error is AttachmentStorageUnavailableError {
  return (
    error instanceof AttachmentStorageUnavailableError ||
    (typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code ===
        ATTACHMENT_STORAGE_UNAVAILABLE_ERROR_CODE)
  );
}
