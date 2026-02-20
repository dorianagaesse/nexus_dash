import { Paperclip, Pencil, Trash2 } from "lucide-react";

import type {
  ProjectContextAttachment,
  ProjectContextCard,
} from "@/components/project-context-panel-types";
import { resolveAttachmentHref } from "@/components/project-context-panel-utils";
import { Button } from "@/components/ui/button";
import { ATTACHMENT_KIND_LINK, isAttachmentPreviewable } from "@/lib/task-attachment";

interface ContextCardsGridProps {
  cards: ProjectContextCard[];
  cardAttachmentsById: Record<string, ProjectContextAttachment[]>;
  deletingCardId: string | null;
  onEditCard: (cardId: string) => void;
  onDeleteCard: (cardId: string) => void | Promise<void>;
  onPreviewAttachment: (attachment: ProjectContextAttachment) => void;
}

export function ContextCardsGrid({
  cards,
  cardAttachmentsById,
  deletingCardId,
  onEditCard,
  onDeleteCard,
  onPreviewAttachment,
}: ContextCardsGridProps) {
  if (cards.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border/60 px-4 py-6 text-sm text-muted-foreground">
        No context cards yet.
      </div>
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => {
        const attachments = cardAttachmentsById[card.id] ?? card.attachments;
        const previewAttachments = attachments.slice(0, 2);

        return (
          <article
            key={card.id}
            className="rounded-md border p-2.5"
            style={{ backgroundColor: card.color, borderColor: "rgb(15 23 42 / 0.15)" }}
          >
            <div className="mb-1.5 flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900">{card.title}</h3>
              <div className="flex items-center gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-slate-800 hover:bg-slate-900/10"
                  onClick={() => onEditCard(card.id)}
                  aria-label="Edit context card"
                >
                  <Pencil className="h-4 w-4" />
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-slate-800 hover:bg-slate-900/10"
                  onClick={() => void onDeleteCard(card.id)}
                  disabled={deletingCardId === card.id}
                  aria-label="Delete context card"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <p className="whitespace-pre-wrap break-words text-xs text-slate-800">
              {card.content || "No content."}
            </p>

            {attachments.length > 0 ? (
              <div className="mt-2 space-y-1">
                {previewAttachments.map((attachment) => {
                  const href = resolveAttachmentHref(attachment);
                  const canPreview =
                    isAttachmentPreviewable(attachment.kind, attachment.mimeType) &&
                    Boolean(attachment.downloadUrl);

                  if (canPreview) {
                    return (
                      <button
                        key={attachment.id}
                        type="button"
                        onClick={() => onPreviewAttachment(attachment)}
                        className="flex min-w-0 items-center gap-1 text-xs text-slate-900 underline underline-offset-2"
                      >
                        <Paperclip className="h-3 w-3" />
                        <span className="truncate">{attachment.name}</span>
                      </button>
                    );
                  }

                  if (!href) {
                    return null;
                  }

                  return (
                    <div key={attachment.id} className="flex items-center gap-1">
                      <a
                        href={href}
                        target={attachment.kind === ATTACHMENT_KIND_LINK ? "_blank" : undefined}
                        rel={attachment.kind === ATTACHMENT_KIND_LINK ? "noreferrer" : undefined}
                        className="flex min-w-0 flex-1 items-center gap-1 text-xs text-slate-900 underline underline-offset-2"
                      >
                        <Paperclip className="h-3 w-3" />
                        <span className="truncate">{attachment.name}</span>
                      </a>
                    </div>
                  );
                })}
                {attachments.length > previewAttachments.length ? (
                  <p className="text-xs text-slate-700">
                    +{attachments.length - previewAttachments.length} more attachment
                    {attachments.length - previewAttachments.length === 1 ? "" : "s"}
                  </p>
                ) : null}
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
