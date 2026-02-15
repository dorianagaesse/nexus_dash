import { CONTEXT_CARD_COLORS } from "@/lib/context-card-colors";
import { ATTACHMENT_KIND_FILE, ATTACHMENT_KIND_LINK } from "@/lib/task-attachment";

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
