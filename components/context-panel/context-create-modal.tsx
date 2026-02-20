import type { FormEvent } from "react";
import { Link2, Paperclip, Trash2, Upload } from "lucide-react";

import { ContextColorPicker } from "@/components/context-panel/context-color-picker";
import { ContextModalFrame } from "@/components/context-panel/context-modal-frame";
import type { PendingAttachmentLink } from "@/components/project-context-panel-types";
import { Button } from "@/components/ui/button";

interface ContextCreateModalProps {
  isOpen: boolean;
  isCreatingCard: boolean;
  createColor: string;
  createLinkUrl: string;
  isCreateLinkComposerOpen: boolean;
  createAttachmentLinks: PendingAttachmentLink[];
  createSelectedFiles: File[];
  createFileInputKey: number;
  createError: string | null;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  onCreateColorChange: (color: string) => void;
  onCreateLinkUrlChange: (value: string) => void;
  onToggleCreateLinkComposer: () => void;
  onStageCreateLink: () => void;
  onRemoveCreateLink: (linkId: string) => void;
  onCreateFilesSelected: (files: File[]) => void;
  onClearCreateFiles: () => void;
}

export function ContextCreateModal({
  isOpen,
  isCreatingCard,
  createColor,
  createLinkUrl,
  isCreateLinkComposerOpen,
  createAttachmentLinks,
  createSelectedFiles,
  createFileInputKey,
  createError,
  onClose,
  onSubmit,
  onCreateColorChange,
  onCreateLinkUrlChange,
  onToggleCreateLinkComposer,
  onStageCreateLink,
  onRemoveCreateLink,
  onCreateFilesSelected,
  onClearCreateFiles,
}: ContextCreateModalProps) {
  if (!isOpen) {
    return null;
  }

  const serializedCreateLinks = JSON.stringify(
    createAttachmentLinks.map((link) => ({
      name: "",
      url: link.url,
    }))
  );

  return (
    <ContextModalFrame title="Add context card" onClose={onClose}>
      <form className="grid gap-4" onSubmit={(event) => void onSubmit(event)}>
        <div className="grid gap-2">
          <label htmlFor="context-create-title" className="text-sm font-medium">
            Title
          </label>
          <input
            id="context-create-title"
            name="title"
            required
            minLength={2}
            maxLength={120}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            placeholder="Sprint notes"
          />
        </div>

        <div className="grid gap-2">
          <label htmlFor="context-create-content" className="text-sm font-medium">
            Content
          </label>
          <textarea
            id="context-create-content"
            name="content"
            rows={5}
            maxLength={4000}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="Anything useful for this project..."
          />
        </div>

        <ContextColorPicker selectedColor={createColor} onSelect={onCreateColorChange} />
        <input type="hidden" name="color" value={createColor} />
        <input type="hidden" name="attachmentLinks" value={serializedCreateLinks} />

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={isCreateLinkComposerOpen ? "secondary" : "ghost"}
              size="icon"
              onClick={onToggleCreateLinkComposer}
              aria-label="Add attachment link"
            >
              <Link2 className="h-4 w-4" />
            </Button>
            <input
              key={createFileInputKey}
              id="context-create-attachment-files"
              type="file"
              name="attachmentFiles"
              multiple
              onChange={(event) => {
                const nextFiles = Array.from(event.target.files ?? []);
                onCreateFilesSelected(nextFiles);
              }}
              className="hidden"
            />
            <Button type="button" variant="ghost" size="icon" asChild>
              <label
                htmlFor="context-create-attachment-files"
                aria-label="Upload attachment files"
                className="cursor-pointer"
              >
                <Upload className="h-4 w-4" />
              </label>
            </Button>
          </div>

          {isCreateLinkComposerOpen ? (
            <div className="flex items-center gap-2 rounded-md border border-border/60 bg-background p-2">
              <input
                value={createLinkUrl}
                onChange={(event) => onCreateLinkUrlChange(event.target.value)}
                placeholder="https://..."
                className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-xs"
              />
              <Button
                type="button"
                size="icon"
                variant="secondary"
                onClick={onStageCreateLink}
                disabled={!createLinkUrl.trim()}
                aria-label="Confirm attachment link"
              >
                <Link2 className="h-4 w-4" />
              </Button>
            </div>
          ) : null}

          {createAttachmentLinks.length > 0 ? (
            <div className="space-y-2">
              {createAttachmentLinks.map((link) => (
                <div
                  key={link.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background px-2 py-1.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-foreground">
                      {link.url}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onRemoveCreateLink(link.id)}
                    aria-label="Remove staged link"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          ) : null}

          {createSelectedFiles.length > 0 ? (
            <div className="space-y-2 rounded-md border border-border/60 bg-background p-2">
              {createSelectedFiles.map((file) => (
                <p
                  key={`${file.name}-${file.size}`}
                  className="truncate text-[11px] text-muted-foreground"
                >
                  <Paperclip className="mr-1 inline h-3 w-3" />
                  {file.name}
                </p>
              ))}
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={onClearCreateFiles}
                aria-label="Clear selected files"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <Button type="submit" disabled={isCreatingCard}>
            {isCreatingCard ? "Creating..." : "Create card"}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose} disabled={isCreatingCard}>
            Cancel
          </Button>
        </div>
        {createError ? (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {createError}
          </div>
        ) : null}
      </form>
    </ContextModalFrame>
  );
}
