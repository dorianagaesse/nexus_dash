export const ATTACHMENT_KIND_LINK = "link";
export const ATTACHMENT_KIND_FILE = "file";

export const ATTACHMENT_KINDS = [
  ATTACHMENT_KIND_LINK,
  ATTACHMENT_KIND_FILE,
] as const;

export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

// Keep form-based uploads under Vercel serverless payload thresholds.
export const MAX_ATTACHMENT_FILE_SIZE_BYTES = 4 * 1024 * 1024;
export const MAX_ATTACHMENT_FILE_SIZE_LABEL = "4MB";

// Direct-to-R2 uploads bypass app API payload limits and can safely allow larger files.
export const DIRECT_UPLOAD_MAX_ATTACHMENT_FILE_SIZE_BYTES = 25 * 1024 * 1024;
export const DIRECT_UPLOAD_MAX_ATTACHMENT_FILE_SIZE_LABEL = "25MB";

export const ALLOWED_ATTACHMENT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/pjpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/avif",
  "image/gif",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
] as const;

const EXTENSION_TO_MIME_TYPE: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  avif: "image/avif",
  gif: "image/gif",
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  csv: "text/csv",
  json: "application/json",
};

function normalizeMimeType(rawMimeType: string | null | undefined): string {
  if (!rawMimeType) {
    return "";
  }

  return rawMimeType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function inferMimeTypeFromFilename(filename: string | null | undefined): string | null {
  if (!filename) {
    return null;
  }

  const trimmed = filename.trim();
  if (!trimmed) {
    return null;
  }

  const extension = trimmed.split(".").pop()?.toLowerCase();
  if (!extension) {
    return null;
  }

  return EXTENSION_TO_MIME_TYPE[extension] ?? null;
}

export function isAttachmentKind(value: string): value is AttachmentKind {
  return ATTACHMENT_KINDS.includes(value as AttachmentKind);
}

export function isAllowedAttachmentMimeType(mimeType: string): boolean {
  const normalizedMimeType = normalizeMimeType(mimeType);
  return ALLOWED_ATTACHMENT_MIME_TYPES.includes(
    normalizedMimeType as (typeof ALLOWED_ATTACHMENT_MIME_TYPES)[number]
  );
}

export function resolveAttachmentMimeType(
  rawMimeType: string | null | undefined,
  filename: string | null | undefined
): string | null {
  const normalizedMimeType = normalizeMimeType(rawMimeType);
  if (isAllowedAttachmentMimeType(normalizedMimeType)) {
    return normalizedMimeType;
  }

  const canUseFilenameFallback =
    normalizedMimeType.length === 0 ||
    normalizedMimeType === "application/octet-stream" ||
    normalizedMimeType === "binary/octet-stream";
  if (!canUseFilenameFallback) {
    return null;
  }

  const inferredMimeType = inferMimeTypeFromFilename(filename);
  if (inferredMimeType && isAllowedAttachmentMimeType(inferredMimeType)) {
    return inferredMimeType;
  }

  return null;
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

export function isImageAttachment(
  kind: string,
  mimeType: string | null | undefined
): boolean {
  return (
    kind === ATTACHMENT_KIND_FILE &&
    typeof mimeType === "string" &&
    mimeType.startsWith("image/")
  );
}

export function buildAttachmentInlineUrl(downloadUrl: string | null): string | null {
  if (!downloadUrl) {
    return null;
  }

  const separator = downloadUrl.includes("?") ? "&" : "?";
  return `${downloadUrl}${separator}disposition=inline`;
}

export interface ParsedAttachmentLink {
  name: string;
  url: string;
}

export type AttachmentInputErrorCode =
  | "attachment-link-invalid"
  | "attachment-file-too-large"
  | "attachment-file-type-invalid";

export function parseAttachmentLinksArray(payload: unknown): {
  links: ParsedAttachmentLink[];
  error: AttachmentInputErrorCode | null;
} {
  if (!Array.isArray(payload)) {
    return { links: [], error: "attachment-link-invalid" };
  }

  const links: ParsedAttachmentLink[] = [];

  for (const item of payload) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { links: [], error: "attachment-link-invalid" };
    }

    const linkInput = item as { name?: unknown; url?: unknown };
    const rawUrl = typeof linkInput.url === "string" ? linkInput.url.trim() : "";
    const normalizedUrl = normalizeAttachmentUrl(rawUrl);

    if (!normalizedUrl) {
      return { links: [], error: "attachment-link-invalid" };
    }

    const rawName = typeof linkInput.name === "string" ? linkInput.name.trim() : "";
    links.push({
      name: rawName || new URL(normalizedUrl).hostname,
      url: normalizedUrl,
    });
  }

  return { links, error: null };
}

export function parseAttachmentLinksJson(rawValue: string): {
  links: ParsedAttachmentLink[];
  error: AttachmentInputErrorCode | null;
} {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return { links: [], error: null };
  }

  let payload: unknown;

  try {
    payload = JSON.parse(trimmed);
  } catch {
    return { links: [], error: "attachment-link-invalid" };
  }

  return parseAttachmentLinksArray(payload);
}

export function parseAttachmentLinksInput(value: unknown): {
  links: ParsedAttachmentLink[];
  error: AttachmentInputErrorCode | null;
} {
  if (value === undefined || value === null) {
    return { links: [], error: null };
  }

  if (typeof value === "string") {
    return parseAttachmentLinksJson(value);
  }

  return parseAttachmentLinksArray(value);
}

export function validateAttachmentFiles(
  files: File[]
): AttachmentInputErrorCode | null {
  for (const file of files) {
    if (file.size > MAX_ATTACHMENT_FILE_SIZE_BYTES) {
      return "attachment-file-too-large";
    }

    if (!resolveAttachmentMimeType(file.type, file.name)) {
      return "attachment-file-type-invalid";
    }
  }

  return null;
}
