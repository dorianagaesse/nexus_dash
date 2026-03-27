import { useState } from "react";
import { MoreHorizontal, Paperclip, Pencil, PlusSquare, Trash2 } from "lucide-react";

import type {
  ProjectContextAttachment,
  ProjectContextCard,
} from "@/components/project-context-panel-types";
import {
  CONTEXT_CARD_PREVIEW_RICH_TEXT_CLASS,
  getContextCardContentHtml,
  resolveAttachmentHref,
} from "@/components/project-context-panel-utils";
import { Button } from "@/components/ui/button";
import { useDismissibleMenu } from "@/lib/hooks/use-dismissible-menu";
import { ATTACHMENT_KIND_LINK, isAttachmentPreviewable } from "@/lib/task-attachment";

interface ContextCardsGridProps {
  canEdit: boolean;
  cards: ProjectContextCard[];
  cardAttachmentsById: Record<string, ProjectContextAttachment[]>;
  deletingCardId: string | null;
  onOpenPreview: (cardId: string) => void;
  onEditCard: (cardId: string) => void;
  onDeleteCard: (cardId: string) => void;
  onPreviewAttachment: (attachment: ProjectContextAttachment) => void;
}

export function ContextCardsGrid({
  canEdit,
  cards,
  cardAttachmentsById,
  deletingCardId,
  onOpenPreview,
  onEditCard,
  onDeleteCard,
  onPreviewAttachment,
}: ContextCardsGridProps) {
  if (cards.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 bg-background/50 px-5 py-8 text-center">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-border/60 bg-muted/40 text-muted-foreground">
          <PlusSquare className="h-5 w-5" />
        </div>
        <p className="text-sm font-medium text-foreground">No context cards yet</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => {
        const attachments = cardAttachmentsById[card.id] ?? card.attachments;
        const previewAttachments = attachments.slice(0, 2);
        const contentHtml = getContextCardContentHtml(card.content);

        return (
          <article
            key={card.id}
            className="flex aspect-[1.618/1] min-h-[148px] max-h-[176px] cursor-pointer flex-col overflow-hidden rounded-2xl border p-3 transition duration-150 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-18px_rgba(15,23,42,0.45)] hover:ring-2 hover:ring-slate-900/10"
            style={{ backgroundColor: card.color, borderColor: "rgb(15 23 42 / 0.15)" }}
            onClick={() => onOpenPreview(card.id)}
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <h3
                className="max-h-10 overflow-hidden text-sm font-semibold leading-5 text-slate-900"
                onDoubleClick={(event) => {
                  if (!canEdit) {
                    return;
                  }

                  event.stopPropagation();
                  onEditCard(card.id);
                }}
              >
                {card.title}
              </h3>
              {canEdit ? (
                <ContextCardOptionsMenu
                  cardId={card.id}
                  deletingCardId={deletingCardId}
                  onEditCard={onEditCard}
                  onDeleteCard={onDeleteCard}
                />
              ) : null}
            </div>
            <div
              className="relative min-h-0 flex-1 overflow-hidden"
              onDoubleClick={(event) => {
                if (!canEdit) {
                  return;
                }

                event.stopPropagation();
                onEditCard(card.id);
              }}
            >
              <div
                className={`pr-1 text-xs text-slate-800 ${CONTEXT_CARD_PREVIEW_RICH_TEXT_CLASS}`}
                dangerouslySetInnerHTML={{ __html: contentHtml }}
              />
              <div
                className="pointer-events-none absolute inset-x-0 bottom-0 h-10"
                style={{
                  background: `linear-gradient(to top, ${card.color}, transparent)`,
                }}
              />
            </div>

            {attachments.length > 0 ? (
              <div className="mt-2 space-y-1 border-t border-slate-900/10 pt-2">
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
                        onClick={(event) => {
                          event.stopPropagation();
                          onPreviewAttachment(attachment);
                        }}
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
                        onClick={(event) => event.stopPropagation()}
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

interface ContextCardOptionsMenuProps {
  cardId: string;
  deletingCardId: string | null;
  onEditCard: (cardId: string) => void;
  onDeleteCard: (cardId: string) => void;
}

function ContextCardOptionsMenu({
  cardId,
  deletingCardId,
  onEditCard,
  onDeleteCard,
}: ContextCardOptionsMenuProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useDismissibleMenu<HTMLDivElement>(isMenuOpen, () => setIsMenuOpen(false));

  return (
    <div
      ref={menuRef}
      className="relative"
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="rounded-md p-1 text-slate-800 hover:bg-slate-900/10"
        aria-label="Context card options"
        aria-expanded={isMenuOpen}
        onClick={() => setIsMenuOpen((previous) => !previous)}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {isMenuOpen ? (
        <div className="absolute right-0 z-20 mt-1 w-36 rounded-md border border-border/70 bg-background p-1 shadow-md">
          <Button
            type="button"
            variant="ghost"
            className="w-full justify-start"
            onClick={() => {
              setIsMenuOpen(false);
              onEditCard(cardId);
            }}
          >
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => {
              setIsMenuOpen(false);
              onDeleteCard(cardId);
            }}
            disabled={deletingCardId === cardId}
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>
      ) : null}
    </div>
  );
}
