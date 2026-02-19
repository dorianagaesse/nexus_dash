"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, X } from "lucide-react";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildAttachmentInlineUrl,
  getAttachmentPreviewKind,
  isAttachmentPreviewable,
} from "@/lib/task-attachment";

interface AttachmentPreviewTarget {
  kind: string;
  name: string;
  mimeType: string | null;
  downloadUrl: string | null;
}

interface AttachmentPreviewModalProps {
  attachment: AttachmentPreviewTarget | null;
  onClose: () => void;
}

export function AttachmentPreviewModal({
  attachment,
  onClose,
}: AttachmentPreviewModalProps) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!attachment) {
    return null;
  }

  const previewKind = getAttachmentPreviewKind(attachment.mimeType);
  const previewUrl = buildAttachmentInlineUrl(attachment.downloadUrl);
  const canPreview =
    isAttachmentPreviewable(attachment.kind, attachment.mimeType) &&
    previewKind !== null &&
    previewUrl !== null;

  if (!isClient) {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex min-h-dvh w-screen items-center justify-center overscroll-y-contain bg-black/75 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <Card
        className="w-full max-w-4xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="truncate text-base">
            {attachment.name}
          </CardTitle>
          <div className="flex items-center gap-1">
            {previewUrl ? (
              <Button variant="ghost" size="sm" asChild>
                <a href={previewUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  Open
                </a>
              </Button>
            ) : null}
            {attachment.downloadUrl ? (
              <Button variant="ghost" size="sm" asChild>
                <a href={attachment.downloadUrl}>Download</a>
              </Button>
            ) : null}
            <Button type="button" variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {canPreview && previewKind === "image" ? (
            <div className="max-h-[70vh] overflow-auto rounded-md border border-border/60 bg-muted/10 p-2">
              <Image
                src={previewUrl}
                alt={attachment.name}
                width={1600}
                height={1200}
                unoptimized
                className="mx-auto h-auto max-h-[66vh] w-auto object-contain"
              />
            </div>
          ) : null}

          {canPreview && previewKind === "pdf" ? (
            <iframe
              src={previewUrl}
              title={`Preview ${attachment.name}`}
              className="h-[70vh] w-full rounded-md border border-border/60 bg-background"
            />
          ) : null}

          {!canPreview ? (
            <p className="text-sm text-muted-foreground">
              Preview is currently available for image and PDF attachments only.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>,
    document.body
  );
}
