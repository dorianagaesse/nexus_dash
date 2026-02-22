"use client";

import { createPortal } from "react-dom";
import { Paperclip, X } from "lucide-react";

import type {
  ProjectContextAttachment,
  ProjectContextCard,
} from "@/components/project-context-panel-types";
import { resolveAttachmentHref } from "@/components/project-context-panel-utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ATTACHMENT_KIND_LINK, isAttachmentPreviewable } from "@/lib/task-attachment";

interface ContextPreviewModalProps {
  isOpen: boolean;
  card: ProjectContextCard | null;
  attachments: ProjectContextAttachment[];
  onClose: () => void;
  onEdit: (cardId: string) => void;
  onPreviewAttachment: (attachment: ProjectContextAttachment) => void;
}

export function ContextPreviewModal({
  isOpen,
  card,
  attachments,
  onClose,
  onEdit,
  onPreviewAttachment,
}: ContextPreviewModalProps) {
  if (!isOpen || !card || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[95] flex min-h-dvh w-screen items-center justify-center bg-black/70 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <Card
        className="max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto"
        style={{ backgroundColor: card.color, borderColor: "rgb(15 23 42 / 0.2)" }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <CardTitle
            className="text-xl text-slate-900"
            onDoubleClick={() => onEdit(card.id)}
          >
            {card.title}
          </CardTitle>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-slate-800 hover:bg-slate-900/10"
            onClick={onClose}
            aria-label="Close context preview"
          >
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <p
            className="whitespace-pre-wrap break-words text-sm text-slate-800"
            onDoubleClick={() => onEdit(card.id)}
          >
            {card.content || "No content."}
          </p>

          <div className="space-y-2 rounded-md border border-slate-900/15 bg-white/45 p-3">
            <p className="text-sm font-medium text-slate-900">Attachments</p>
            {attachments.length === 0 ? (
              <p className="text-xs text-slate-700">No attachments yet.</p>
            ) : (
              <div className="space-y-2">
                {attachments.map((attachment) => {
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
                    <a
                      key={attachment.id}
                      href={href}
                      target={attachment.kind === ATTACHMENT_KIND_LINK ? "_blank" : undefined}
                      rel={attachment.kind === ATTACHMENT_KIND_LINK ? "noreferrer" : undefined}
                      className="flex min-w-0 items-center gap-1 text-xs text-slate-900 underline underline-offset-2"
                    >
                      <Paperclip className="h-3 w-3" />
                      <span className="truncate">{attachment.name}</span>
                    </a>
                  );
                })}
              </div>
            )}
          </div>

          <p className="text-xs text-slate-700">
            Tip: double-click title or content to edit this card.
          </p>
        </CardContent>
      </Card>
    </div>,
    document.body
  );
}
