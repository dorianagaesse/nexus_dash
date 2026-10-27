import type { ProjectContextCard } from "@/components/project-context-panel-types";
import { normalizeContextCardContentHtml } from "@/components/project-context-panel-utils";
import { CONTEXT_CARD_COLORS } from "@/lib/context-card-colors";
import type { LiveSaveFieldMetaMap, LiveSaveValidation } from "@/lib/live-save/types";
import { richTextToPlainText } from "@/lib/rich-text";

export type ContextCardLiveDocument = {
  title: string;
  content: string;
  color: string;
  contentRevision: number;
  card: ProjectContextCard | null;
};

export const CONTEXT_CARD_LIVE_FIELDS = ["title", "content", "color"] as const;

export const CONTEXT_CARD_LIVE_FIELD_META: LiveSaveFieldMetaMap<ContextCardLiveDocument> = {
  title: { label: "Title" },
  content: { label: "Content", richText: true },
  color: { label: "Color" },
};

export const EMPTY_CONTEXT_CARD_LIVE_DOCUMENT: ContextCardLiveDocument = {
  title: "",
  content: "",
  color: CONTEXT_CARD_COLORS[0],
  contentRevision: 0,
  card: null,
};

export function toContextCardLiveDocument(card: ProjectContextCard): ContextCardLiveDocument {
  return {
    title: card.title,
    content: normalizeContextCardContentHtml(card.content),
    color: card.color,
    contentRevision: card.contentRevision,
    card,
  };
}

export function buildContextCardLivePayload(
  draft: { title: string; content: string; color: string },
  fields: Partial<ContextCardLiveDocument>
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (Object.prototype.hasOwnProperty.call(fields, "title")) {
    payload.title = draft.title.trim();
  }
  if (Object.prototype.hasOwnProperty.call(fields, "content")) {
    payload.content = normalizeContextCardContentHtml(draft.content);
  }
  if (Object.prototype.hasOwnProperty.call(fields, "color")) {
    payload.color = draft.color;
  }
  return payload;
}

export function validateContextCardLiveDocument(
  value: ContextCardLiveDocument
): LiveSaveValidation {
  const title = value.title.trim();
  if (title.length < 2) {
    return { valid: false, message: "context-title-too-short" };
  }
  if (title.length > 120) {
    return { valid: false, message: "context-title-too-long" };
  }
  if (
    richTextToPlainText(normalizeContextCardContentHtml(value.content)).length > 4000
  ) {
    return { valid: false, message: "context-content-too-long" };
  }
  return { valid: true };
}
