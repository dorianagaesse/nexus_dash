import {
  isAllowedAttachmentMimeType,
  normalizeAttachmentUrl,
  MAX_ATTACHMENT_FILE_SIZE_BYTES,
} from "@/lib/task-attachment";

export interface ParsedAttachmentLink {
  name: string;
  url: string;
}

export type AttachmentInputErrorCode =
  | "attachment-link-invalid"
  | "attachment-file-too-large"
  | "attachment-file-type-invalid";

export function parseAttachmentLinksJson(rawValue: string): {
  links: ParsedAttachmentLink[];
  error: AttachmentInputErrorCode | null;
} {
  if (!rawValue) {
    return { links: [], error: null };
  }

  let payload: unknown;

  try {
    payload = JSON.parse(rawValue);
  } catch {
    return { links: [], error: "attachment-link-invalid" };
  }

  if (!Array.isArray(payload)) {
    return { links: [], error: "attachment-link-invalid" };
  }

  const links: ParsedAttachmentLink[] = [];

  for (const item of payload) {
    if (!item || typeof item !== "object") {
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

export function validateAttachmentFiles(
  files: File[]
): AttachmentInputErrorCode | null {
  for (const file of files) {
    if (file.size > MAX_ATTACHMENT_FILE_SIZE_BYTES) {
      return "attachment-file-too-large";
    }

    if (!isAllowedAttachmentMimeType(file.type)) {
      return "attachment-file-type-invalid";
    }
  }

  return null;
}
