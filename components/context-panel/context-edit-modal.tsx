import type { FormEvent } from "react";
import { Link2, Trash2, Upload } from "lucide-react";

import { ContextColorPicker } from "@/components/context-panel/context-color-picker";
import { ContextModalFrame } from "@/components/context-panel/context-modal-frame";
import type {
  ProjectContextAttachment,
  ProjectContextCard,
} from "@/components/project-context-panel-types";
import { resolveAttachmentHref } from "@/components/project-context-panel-utils";
import { RichTextEditor } from "@/components/rich-text-editor";
import { AttachmentLinkComposer } from "@/components/ui/attachment-link-composer";
import { Button } from "@/components/ui/button";
import { EmojiInputField } from "@/components/ui/emoji-field";
import {
  ATTACHMENT_KIND_FILE,
  ATTACHMENT_KIND_LINK,
  formatAttachmentFileSize,
  isAttachmentPreviewable,
} from "@/lib/task-attachment";

interface ContextEditModalProps {
  editingCard: ProjectContextCard | null;
  editingColor: string;
  editContent: string;
  editingCardAttachments: ProjectContextAttachment[];
  isUpdatingCard: boolean;
  isSubmittingAttachment: boolean;
  isEditLinkComposerOpen: boolean;
  editLinkUrl: string;
  editFileInputKey: number;
  attachmentError: string | null;
  editError: string | null;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  onEditingColorChange: (color: string) => void;
  onEditContentChange: (value: string) => void;
  onPreviewAttachment: (attachment: ProjectContextAttachment) => void;
  onDeleteAttachment: (attachmentId: string) => void | Promise<void>;
  onToggleEditLinkComposer: () => void;
  onAddFileAttachment: (file: File | null) => void | Promise<void>;
  onEditLinkUrlChange: (value: string) => void;
  onAddLinkAttachment: () => void | Promise<void>;
}

export function ContextEditModal({
  editingCard,
  editingColor,
  editContent,
  editingCardAttachments,
  isUpdatingCard,
  isSubmittingAttachment,
  isEditLinkComposerOpen,
  editLinkUrl,
  editFileInputKey,
  attachmentError,
  editError,
  onClose,
  onSubmit,
  onEditingColorChange,
  onEditContentChange,
  onPreviewAttachment,
  onDeleteAttachment,
  onToggleEditLinkComposer,
  onAddFileAttachment,
  onEditLinkUrlChange,
  onAddLinkAttachment,
}: ContextEditModalProps) {
  if (!editingCard) {
    return null;
  }

  return (
    <ContextModalFrame title="Edit context card" onClose={onClose}>
      <form className="grid gap-4" onSubmit={(event) => void onSubmit(event)}>
        <input type="hidden" name="cardId" value={editingCard.id} />
        <div className="grid gap-2">
          <label htmlFor="context-edit-title" className="text-sm font-medium">
            Title
          </label>
          <EmojiInputField
            id="context-edit-title"
            name="title"
            required
            minLength={2}
            maxLength={120}
            defaultValue={editingCard.title}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          />
        </div>

        <div className="grid gap-2">
          <div id="context-edit-content-label" className="text-sm font-medium">
            Content
          </div>
          <RichTextEditor
            id="context-edit-content"
            value={editContent}
            onChange={onEditContentChange}
            ariaLabelledBy="context-edit-content-label"
          />
          <input type="hidden" name="content" value={editContent} />
        </div>

        <ContextColorPicker selectedColor={editingColor} onSelect={onEditingColorChange} />
        <input type="hidden" name="color" value={editingColor} />

        <div className="space-y-2">
          {editingCardAttachments.length === 0 ? (
            <p className="text-xs text-muted-foreground">No attachments yet.</p>
          ) : (
            <div className="space-y-2">
              {editingCardAttachments.map((attachment) => {
                const href = resolveAttachmentHref(attachment);
                const canPreview =
                  isAttachmentPreviewable(attachment.kind, attachment.mimeType) &&
                  Boolean(attachment.downloadUrl);

                return (
                  <div
                    key={attachment.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background px-2 py-1.5"
                  >
                    <div className="min-w-0">
                      {canPreview ? (
                        <button
                          type="button"
                          onClick={() => onPreviewAttachment(attachment)}
                          className="truncate text-left text-xs font-medium text-foreground underline underline-offset-2"
                          disabled={isSubmittingAttachment}
                        >
                          {attachment.name}
                        </button>
                      ) : href ? (
                        <a
                          href={href}
                          target={attachment.kind === ATTACHMENT_KIND_LINK ? "_blank" : undefined}
                          rel={attachment.kind === ATTACHMENT_KIND_LINK ? "noreferrer" : undefined}
                          className="truncate text-xs font-medium text-foreground underline underline-offset-2"
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
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => void onDeleteAttachment(attachment.id)}
                        disabled={isSubmittingAttachment}
                        aria-label="Delete attachment"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={isEditLinkComposerOpen ? "secondary" : "ghost"}
              size="icon"
              onClick={onToggleEditLinkComposer}
              disabled={isSubmittingAttachment}
              aria-label="Open attachment link input"
            >
              <Link2 className="h-4 w-4" />
            </Button>
            <input
              key={editFileInputKey}
              id="context-edit-attachment-file"
              type="file"
              onChange={(event) => void onAddFileAttachment(event.target.files?.[0] ?? null)}
              className="hidden"
            />
            <Button type="button" variant="ghost" size="icon" asChild disabled={isSubmittingAttachment}>
              <label
                htmlFor="context-edit-attachment-file"
                aria-label="Upload attachment file"
                className="cursor-pointer"
              >
                <Upload className="h-4 w-4" />
              </label>
            </Button>
          </div>

          {isEditLinkComposerOpen ? (
            <AttachmentLinkComposer
              value={editLinkUrl}
              onValueChange={onEditLinkUrlChange}
              onSubmit={onAddLinkAttachment}
              isSubmitDisabled={isSubmittingAttachment || !editLinkUrl.trim()}
            />
          ) : null}

          {attachmentError ? (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {attachmentError}
            </div>
          ) : null}
          {editError ? (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {editError}
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <Button type="submit" disabled={isUpdatingCard || isSubmittingAttachment}>
            {isUpdatingCard ? "Saving..." : "Save card"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={isUpdatingCard || isSubmittingAttachment}
          >
            Cancel
          </Button>
        </div>
      </form>
    </ContextModalFrame>
  );
}
