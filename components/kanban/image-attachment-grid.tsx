"use client";

import Image from "next/image";
import { LoaderCircle, X } from "lucide-react";

import type {
  PendingAttachmentUpload,
  TaskAttachment,
} from "@/components/kanban-board-types";
import { Button } from "@/components/ui/button";
import { buildAttachmentInlineUrl } from "@/lib/task-attachment";

interface ImageAttachmentGridProps {
  attachments: TaskAttachment[];
  pendingUploads?: PendingAttachmentUpload[];
  onPreview: (attachment: TaskAttachment) => void;
  onRemove?: (attachmentId: string) => void | Promise<void>;
  compact?: boolean;
}

export function ImageAttachmentGrid({
  attachments,
  pendingUploads = [],
  onPreview,
  onRemove,
  compact = false,
}: ImageAttachmentGridProps) {
  if (attachments.length === 0 && pendingUploads.length === 0) {
    return null;
  }

  return (
    <div
      className={
        compact
          ? "grid grid-cols-2 gap-2 sm:grid-cols-3"
          : "grid grid-cols-1 gap-2 sm:grid-cols-2"
      }
      aria-label="Image attachments"
    >
      {attachments.map((attachment) => {
        const previewUrl = buildAttachmentInlineUrl(attachment.downloadUrl);
        if (!previewUrl) {
          return null;
        }

        return (
          <div
            key={attachment.id}
            className="group relative min-w-0 overflow-hidden rounded-lg border border-border/60 bg-muted/20"
          >
            <button
              type="button"
              onClick={() => onPreview(attachment)}
              className="relative block aspect-[16/10] w-full cursor-pointer overflow-hidden bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label={`Preview image ${attachment.name}`}
            >
              <Image
                src={previewUrl}
                alt={attachment.name}
                fill
                sizes={compact ? "(max-width: 640px) 50vw, 180px" : "(max-width: 640px) 100vw, 320px"}
                unoptimized
                className="object-cover transition-opacity duration-150 group-hover:opacity-90"
              />
            </button>
            <p className="truncate px-2 py-1.5 pr-12 text-xs text-muted-foreground">
              {attachment.name}
            </p>
            {onRemove ? (
              <Button
                type="button"
                variant="secondary"
                size="icon"
                onClick={() => void onRemove(attachment.id)}
                aria-label={`Remove image ${attachment.name}`}
                className="absolute bottom-0 right-0 h-11 w-11 rounded-none rounded-tl-lg"
              >
                <X className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        );
      })}
      {pendingUploads.map((upload) => (
        <div
          key={upload.id}
          className="flex aspect-[16/10] min-w-0 items-center justify-center gap-2 rounded-lg border border-dashed border-border/70 bg-muted/20 px-3 text-xs text-muted-foreground"
          role="status"
        >
          <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />
          <span className="truncate">Uploading {upload.name}</span>
        </div>
      ))}
    </div>
  );
}
