export const ATTACHMENT_KIND_LINK = "link";
export const ATTACHMENT_KIND_FILE = "file";

export const ATTACHMENT_KINDS = [
  ATTACHMENT_KIND_LINK,
  ATTACHMENT_KIND_FILE,
] as const;

export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

export const MAX_ATTACHMENT_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export const ALLOWED_ATTACHMENT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
] as const;

export function isAttachmentKind(value: string): value is AttachmentKind {
  return ATTACHMENT_KINDS.includes(value as AttachmentKind);
}

export function isAllowedAttachmentMimeType(mimeType: string): boolean {
  return ALLOWED_ATTACHMENT_MIME_TYPES.includes(
    mimeType as (typeof ALLOWED_ATTACHMENT_MIME_TYPES)[number]
  );
}

export function normalizeAttachmentUrl(value: string): string | null {
  const rawValue = value.trim();
  if (!rawValue) {
    return null;
  }

  const hasProtocol = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(rawValue);
  const candidate = hasProtocol ? rawValue : `https://${rawValue}`;

  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function formatAttachmentFileSize(sizeBytes: number | null): string {
  if (!sizeBytes || sizeBytes < 0) {
    return "";
  }

  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type AttachmentPreviewKind = "image" | "pdf";

export function getAttachmentPreviewKind(
  mimeType: string | null
): AttachmentPreviewKind | null {
  if (!mimeType) {
    return null;
  }

  if (mimeType === "application/pdf") {
    return "pdf";
  }

  if (mimeType.startsWith("image/")) {
    return "image";
  }

  return null;
}

export function isAttachmentPreviewable(
  kind: string,
  mimeType: string | null
): boolean {
  return kind === ATTACHMENT_KIND_FILE && getAttachmentPreviewKind(mimeType) !== null;
}

export function buildAttachmentInlineUrl(downloadUrl: string | null): string | null {
  if (!downloadUrl) {
    return null;
  }

  const separator = downloadUrl.includes("?") ? "&" : "?";
  return `${downloadUrl}${separator}disposition=inline`;
}
