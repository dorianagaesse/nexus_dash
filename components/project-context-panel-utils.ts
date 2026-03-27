import { CONTEXT_CARD_COLORS } from "@/lib/context-card-colors";
import { coerceRichTextHtml } from "@/lib/rich-text";
import { ATTACHMENT_KIND_FILE, ATTACHMENT_KIND_LINK } from "@/lib/task-attachment";

export const CONTEXT_CARD_PREVIEW_RICH_TEXT_CLASS =
  "[overflow-wrap:anywhere] [&_*]:max-w-full [&_*]:break-words [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:border-l-2 [&_blockquote]:border-slate-900/15 [&_blockquote]:pl-3 [&_h1]:mb-2 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:text-sm [&_h2]:font-semibold [&_li]:mb-1 [&_ol]:list-decimal [&_ol]:pl-4 [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-4 [&_p:last-child]:mb-0 [&_ul:last-child]:mb-0 [&_ol:last-child]:mb-0";

export function getRandomContextColor() {
  const index = Math.floor(Math.random() * CONTEXT_CARD_COLORS.length);
  return CONTEXT_CARD_COLORS[index];
}

export function createLocalId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function resolveAttachmentHref(attachment: {
  kind: string;
  downloadUrl: string | null;
  url: string | null;
}): string | null {
  if (attachment.kind === ATTACHMENT_KIND_FILE) {
    return attachment.downloadUrl;
  }

  if (attachment.kind === ATTACHMENT_KIND_LINK) {
    return attachment.url;
  }

  return null;
}

export async function readApiError(
  response: Response,
  fallbackMessage: string
): Promise<string> {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  return payload?.error ?? fallbackMessage;
}

export function normalizeContextCardContentHtml(content: string | null): string {
  return coerceRichTextHtml(content ?? "") ?? "";
}

export function getContextCardContentHtml(content: string | null): string {
  return normalizeContextCardContentHtml(content) || "<p>No content.</p>";
}
