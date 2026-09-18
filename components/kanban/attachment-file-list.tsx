"use client";

import { LoaderCircle, Paperclip, X } from "lucide-react";

import type {
  PendingAttachmentUpload,
  TaskAttachment,
} from "@/components/kanban-board-types";
import { resolveAttachmentHref } from "@/components/kanban-board-utils";
import { Button } from "@/components/ui/button";
import {
  ATTACHMENT_KIND_FILE,
  ATTACHMENT_KIND_LINK,
  formatAttachmentFileSize,
  isAttachmentPreviewable,
} from "@/lib/task-attachment";

interface AttachmentFileListProps {
  attachments: TaskAttachment[];
  pendingUploads?: PendingAttachmentUpload[];
  onPreview?: (attachment: TaskAttachment) => void;
  onRemove?: (attachmentId: string) => void | Promise<void>;
  removeDisabled?: boolean;
  ariaLabel?: string;
}

export function AttachmentFileList({
  attachments,
  pendingUploads = [],
  onPreview,
  onRemove,
  removeDisabled = false,
  ariaLabel = "File attachments",
}: AttachmentFileListProps) {
  if (attachments.length === 0 && pendingUploads.length === 0) {
    return null;
  }

  return (
    <ul className="space-y-2" aria-label={ariaLabel}>
      {attachments.map((attachment) => {
        const href = resolveAttachmentHref(attachment);
        const canPreview =
          Boolean(onPreview) &&
          isAttachmentPreviewable(attachment.kind, attachment.mimeType) &&
          Boolean(attachment.downloadUrl);

        return (
          <li
            key={attachment.id}
            className="flex min-w-0 items-center gap-2 rounded-md border border-border/60 bg-background px-2 py-1.5"
          >
            <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              {canPreview ? (
                <button
                  type="button"
                  onClick={() => onPreview?.(attachment)}
                  className="block max-w-full truncate text-left text-xs font-medium text-foreground underline underline-offset-2"
                >
                  {attachment.name}
                </button>
              ) : href ? (
                <a
                  href={href}
                  target={attachment.kind === ATTACHMENT_KIND_LINK ? "_blank" : undefined}
                  rel={attachment.kind === ATTACHMENT_KIND_LINK ? "noreferrer" : undefined}
                  className="block max-w-full truncate text-xs font-medium text-foreground underline underline-offset-2"
                >
                  {attachment.name}
                </a>
              ) : (
                <p className="truncate text-xs font-medium text-foreground">
                  {attachment.name}
                </p>
              )}
              {attachment.kind === ATTACHMENT_KIND_FILE ? (
                <p className="text-[11px] text-muted-foreground">
                  {formatAttachmentFileSize(attachment.sizeBytes)}
                </p>
              ) : null}
            </div>
            {onRemove ? (
              <Button
                type="button"
                variant="secondary"
                size="icon"
                onClick={() => void onRemove(attachment.id)}
                disabled={removeDisabled}
                aria-label={`Remove file ${attachment.name}`}
                className="h-11 w-11 shrink-0"
              >
                <X className="h-4 w-4" />
              </Button>
            ) : null}
          </li>
        );
      })}
      {pendingUploads.map((upload) => {
        const sizeLabel = formatAttachmentFileSize(upload.sizeBytes);

        return (
          <li
            key={upload.id}
            className="flex min-w-0 items-center gap-2 rounded-md border border-dashed border-border/70 bg-muted/20 px-2 py-1.5"
            role="status"
          >
            <LoaderCircle className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-foreground">{upload.name}</p>
              <p className="text-[11px] text-muted-foreground">
                {sizeLabel ? `Uploading ${sizeLabel}` : "Uploading..."}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
