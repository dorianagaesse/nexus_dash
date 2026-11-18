"use client";

import { useRef, useState, type SetStateAction } from "react";
import { Paperclip } from "lucide-react";
import { AttachmentPreviewModal } from "@/components/attachment-preview-modal";
import { ImageAttachmentGrid } from "@/components/kanban/image-attachment-grid";
import {
  RichTextEditor,
  type RichTextEditorProps,
} from "@/components/rich-text-editor";
import {
  MAX_MEETING_SCREENSHOTS,
  type MeetingNoteScreenshot,
  type MeetingScreenshotSection,
} from "@/lib/meeting-note-screenshot";
import {
  MAX_ATTACHMENT_FILE_SIZE_BYTES,
  resolveAttachmentMimeType,
} from "@/lib/task-attachment";

export function MeetingScreenshotGallery({
  screenshots,
  onRemove,
}: {
  screenshots: MeetingNoteScreenshot[];
  onRemove?: (id: string) => void;
}) {
  const [preview, setPreview] = useState<MeetingNoteScreenshot | null>(null);
  return (
    <>
      <ImageAttachmentGrid
        attachments={screenshots}
        compact
        onPreview={(attachment) =>
          setPreview(attachment as MeetingNoteScreenshot)
        }
        onRemove={onRemove}
      />
      <AttachmentPreviewModal
        attachment={preview}
        onClose={() => setPreview(null)}
      />
    </>
  );
}

export function MeetingNoteScreenshotEditor({
  projectId,
  section,
  screenshots,
  onScreenshotsChange,
  onUploadingChange,
  disabled,
  ...editorProps
}: RichTextEditorProps & {
  projectId: string;
  section: MeetingScreenshotSection;
  screenshots: MeetingNoteScreenshot[];
  onScreenshotsChange: (value: SetStateAction<MeetingNoteScreenshot[]>) => void;
  onUploadingChange: (uploading: boolean) => void;
  disabled?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [uploadingNames, setUploadingNames] = useState<string[]>([]);
  const uploading = useRef(false);
  const inputId = `${editorProps.id}-screenshots`;
  const label = section === "input" ? "inputs" : "outputs";

  async function upload(files: File[]) {
    if (disabled || uploading.current || !files.length) return;
    setError(null);
    if (screenshots.length + files.length > MAX_MEETING_SCREENSHOTS) {
      setError(`Keep screenshots to ${MAX_MEETING_SCREENSHOTS} per section.`);
      return;
    }
    for (const file of files) {
      if (
        !resolveAttachmentMimeType(file.type, file.name)?.startsWith("image/")
      ) {
        setError("Choose an image file for the screenshot.");
        return;
      }
      if (!file.size || file.size > MAX_ATTACHMENT_FILE_SIZE_BYTES) {
        setError(file.size ? "File exceeds 4MB limit" : "File is empty");
        return;
      }
    }
    uploading.current = true;
    onUploadingChange(true);
    setUploadingNames(files.map((file) => file.name));
    try {
      for (const file of files) {
        const form = new FormData();
        form.append("file", file);
        form.append("section", section);
        const response = await fetch(
          `/api/projects/${projectId}/meeting-notes/attachments`,
          { method: "POST", body: form }
        );
        const payload = await response.json();
        if (!response.ok)
          throw new Error(
            payload.error || "Could not upload screenshot. Please retry."
          );
        const screenshot = payload.attachment as MeetingNoteScreenshot;
        onScreenshotsChange((current) => [...current, screenshot]);
        setUploadingNames((current) => current.slice(1));
      }
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not upload screenshot. Please retry."
      );
    } finally {
      uploading.current = false;
      setUploadingNames([]);
      onUploadingChange(false);
    }
  }

  function remove(id: string) {
    const screenshot = screenshots.find((row) => row.id === id);
    onScreenshotsChange((current) => current.filter((row) => row.id !== id));
    if (screenshot?.isDraft)
      void fetch(`/api/projects/${projectId}/meeting-notes/attachments/${id}`, {
        method: "DELETE",
      }).catch(() => null);
  }

  return (
    <div className="grid min-w-0 gap-2" data-meeting-screenshots={section}>
      <RichTextEditor
        {...editorProps}
        onPasteFiles={(files) => void upload(files)}
        editorCornerActions={
          <label
            htmlFor={inputId}
            aria-label={`Add screenshots to ${label}`}
            title={`Add screenshots to ${label}`}
            aria-disabled={disabled || uploadingNames.length > 0}
            className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-within:ring-2 focus-within:ring-ring"
          >
            <Paperclip className="h-4 w-4" />
            <input
              id={inputId}
              className="sr-only"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/heic,image/heif"
              multiple
              disabled={disabled || uploadingNames.length > 0}
              onChange={(event) => {
                const files = Array.from(event.currentTarget.files ?? []);
                event.currentTarget.value = "";
                void upload(files);
              }}
            />
          </label>
        }
      />
      <MeetingScreenshotGallery
        screenshots={screenshots}
        onRemove={disabled || uploadingNames.length > 0 ? undefined : remove}
      />
      {uploadingNames.length > 0 ? (
        <p role="status" className="text-xs text-muted-foreground">
          Uploading {uploadingNames.join(", ")}…
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
