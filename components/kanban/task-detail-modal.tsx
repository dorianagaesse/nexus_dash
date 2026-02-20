import { createPortal } from "react-dom";
import { Link2, Paperclip, Pencil, Trash2, TriangleAlert, Upload, X } from "lucide-react";

import {
  type KanbanTask,
  type PendingAttachmentUpload,
  type TaskAttachment,
} from "@/components/kanban-board-types";
import {
  formatFollowUpTimestamp,
  resolveAttachmentHref,
} from "@/components/kanban-board-utils";
import { AttachmentPreviewModal } from "@/components/attachment-preview-modal";
import { RichTextEditor } from "@/components/rich-text-editor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ATTACHMENT_KIND_FILE,
  ATTACHMENT_KIND_LINK,
  formatAttachmentFileSize,
  isAttachmentPreviewable,
} from "@/lib/task-attachment";
import { MAX_TASK_LABELS, getTaskLabelColor } from "@/lib/task-label";

interface TaskDetailModalProps {
  isOpen: boolean;
  selectedTask: KanbanTask | null;
  isEditMode: boolean;
  editTitle: string;
  editLabels: string[];
  editLabelInput: string;
  editLabelSuggestions: string[];
  editDescription: string;
  newBlockedFollowUpEntry: string;
  isUpdatingTask: boolean;
  taskModalError: string | null;
  attachmentError: string | null;
  isSubmittingAttachment: boolean;
  hasPendingAttachmentUploads: boolean;
  pendingAttachmentUploads: PendingAttachmentUpload[];
  isLinkComposerOpen: boolean;
  linkUrl: string;
  fileInputKey: number;
  previewAttachment: TaskAttachment | null;
  onClose: () => void;
  onToggleEditMode: (nextValue: boolean) => void;
  onEditTitleChange: (value: string) => void;
  onEditLabelInputChange: (value: string) => void;
  onAddEditLabel: (value: string) => void;
  onRemoveEditLabel: (label: string) => void;
  onEditDescriptionChange: (value: string) => void;
  onNewBlockedFollowUpEntryChange: (value: string) => void;
  onAddBlockedFollowUpEntry: () => void | Promise<void>;
  onSaveTask: () => void | Promise<void>;
  onToggleLinkComposer: () => void;
  onLinkUrlChange: (value: string) => void;
  onAddLinkAttachment: () => void | Promise<void>;
  onAddFileAttachment: (file: File | null) => void | Promise<void>;
  onDeleteAttachment: (attachmentId: string) => void | Promise<void>;
  onPreviewAttachmentChange: (attachment: TaskAttachment | null) => void;
}

export function TaskDetailModal({
  isOpen,
  selectedTask,
  isEditMode,
  editTitle,
  editLabels,
  editLabelInput,
  editLabelSuggestions,
  editDescription,
  newBlockedFollowUpEntry,
  isUpdatingTask,
  taskModalError,
  attachmentError,
  isSubmittingAttachment,
  hasPendingAttachmentUploads,
  pendingAttachmentUploads,
  isLinkComposerOpen,
  linkUrl,
  fileInputKey,
  previewAttachment,
  onClose,
  onToggleEditMode,
  onEditTitleChange,
  onEditLabelInputChange,
  onAddEditLabel,
  onRemoveEditLabel,
  onEditDescriptionChange,
  onNewBlockedFollowUpEntryChange,
  onAddBlockedFollowUpEntry,
  onSaveTask,
  onToggleLinkComposer,
  onLinkUrlChange,
  onAddLinkAttachment,
  onAddFileAttachment,
  onDeleteAttachment,
  onPreviewAttachmentChange,
}: TaskDetailModalProps) {
  if (!isOpen || !selectedTask) {
    return null;
  }

  return (
    <>
      {createPortal(
        <div
          className="fixed inset-0 z-[90] flex min-h-dvh w-screen items-start justify-center overflow-y-auto overscroll-y-contain bg-black/70 p-4 sm:items-center"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              onClose();
            }
          }}
        >
          <Card
            className="max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <CardHeader className="flex flex-row items-start justify-between space-y-0">
              <div className="space-y-2">
                <span className="inline-flex rounded-md border border-border px-2.5 py-1 text-xs font-medium">
                  {selectedTask.status}
                </span>
                {!isEditMode ? (
                  <CardTitle className="text-xl">{selectedTask.title}</CardTitle>
                ) : (
                  <input
                    aria-label="Task title"
                    value={editTitle}
                    onChange={(event) => onEditTitleChange(event.target.value)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  />
                )}
              </div>
              <div className="flex items-center gap-1">
                {!isEditMode ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onToggleEditMode(true)}
                    aria-label="Edit task"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  aria-label="Close task"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {!isEditMode ? (
                <TaskReadOnlyContent
                  selectedTask={selectedTask}
                  pendingAttachmentUploads={pendingAttachmentUploads}
                  onPreviewAttachment={onPreviewAttachmentChange}
                />
              ) : (
                <TaskEditContent
                  selectedTask={selectedTask}
                  editLabels={editLabels}
                  editLabelInput={editLabelInput}
                  editLabelSuggestions={editLabelSuggestions}
                  editDescription={editDescription}
                  newBlockedFollowUpEntry={newBlockedFollowUpEntry}
                  isUpdatingTask={isUpdatingTask}
                  isSubmittingAttachment={isSubmittingAttachment}
                  hasPendingAttachmentUploads={hasPendingAttachmentUploads}
                  pendingAttachmentUploads={pendingAttachmentUploads}
                  isLinkComposerOpen={isLinkComposerOpen}
                  linkUrl={linkUrl}
                  fileInputKey={fileInputKey}
                  attachmentError={attachmentError}
                  taskModalError={taskModalError}
                  onEditLabelInputChange={onEditLabelInputChange}
                  onAddEditLabel={onAddEditLabel}
                  onRemoveEditLabel={onRemoveEditLabel}
                  onEditDescriptionChange={onEditDescriptionChange}
                  onNewBlockedFollowUpEntryChange={onNewBlockedFollowUpEntryChange}
                  onAddBlockedFollowUpEntry={onAddBlockedFollowUpEntry}
                  onPreviewAttachment={onPreviewAttachmentChange}
                  onDeleteAttachment={onDeleteAttachment}
                  onToggleLinkComposer={onToggleLinkComposer}
                  onAddFileAttachment={onAddFileAttachment}
                  onLinkUrlChange={onLinkUrlChange}
                  onAddLinkAttachment={onAddLinkAttachment}
                  onSaveTask={onSaveTask}
                  onCancelEdit={() => onToggleEditMode(false)}
                />
              )}
            </CardContent>
          </Card>
        </div>,
        document.body
      )}
      <AttachmentPreviewModal
        attachment={previewAttachment}
        onClose={() => onPreviewAttachmentChange(null)}
      />
    </>
  );
}

function TaskReadOnlyContent({
  selectedTask,
  pendingAttachmentUploads,
  onPreviewAttachment,
}: {
  selectedTask: KanbanTask;
  pendingAttachmentUploads: PendingAttachmentUpload[];
  onPreviewAttachment: (attachment: TaskAttachment | null) => void;
}) {
  return (
    <>
      {selectedTask.labels.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {selectedTask.labels.map((label) => (
            <span
              key={label}
              className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium text-slate-900"
              style={{
                backgroundColor: getTaskLabelColor(label),
              }}
            >
              {label}
            </span>
          ))}
        </div>
      ) : null}
      {selectedTask.status === "Blocked" ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-200">
          <div className="mb-1 flex items-center gap-2 font-medium">
            <TriangleAlert className="h-4 w-4" />
            Blocked follow-up
          </div>
          {selectedTask.blockedFollowUps.length === 0 ? (
            <p className="whitespace-pre-wrap break-words">No follow-up added yet.</p>
          ) : (
            <div className="space-y-1.5">
              {selectedTask.blockedFollowUps.map((entry) => (
                <article
                  key={entry.id}
                  className="grid grid-cols-[90px_1fr] items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5"
                >
                  <p className="text-[11px] font-medium opacity-90">
                    {formatFollowUpTimestamp(entry.createdAt)}
                  </p>
                  <p className="whitespace-pre-wrap break-words text-[13px]">
                    {entry.content}
                  </p>
                </article>
              ))}
            </div>
          )}
        </div>
      ) : null}
      <div className="max-h-[52vh] overflow-y-auto text-sm text-muted-foreground [overflow-wrap:anywhere] [&_*]:max-w-full [&_*]:break-words [&_h1]:mb-3 [&_h1]:text-xl [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5 [&_p]:mb-2">
        <div
          dangerouslySetInnerHTML={{
            __html: selectedTask.description ?? "<p>No description provided.</p>",
          }}
        />
      </div>
      <div className="grid gap-2 rounded-md border border-border/60 bg-muted/20 p-3">
        <p className="text-sm font-medium">Attachments</p>
        {selectedTask.attachments.length === 0 && pendingAttachmentUploads.length === 0 ? (
          <p className="text-xs text-muted-foreground">No attachments yet.</p>
        ) : (
          <div className="space-y-2">
            {selectedTask.attachments.map((attachment) => {
              const href = resolveAttachmentHref(attachment);
              const canPreview =
                isAttachmentPreviewable(attachment.kind, attachment.mimeType) &&
                Boolean(attachment.downloadUrl);

              return (
                <div
                  key={attachment.id}
                  className="flex items-center gap-2 rounded-md border border-border/60 bg-background px-2 py-1.5"
                >
                  <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    {canPreview ? (
                      <button
                        type="button"
                        onClick={() => onPreviewAttachment(attachment)}
                        className="truncate text-left text-xs font-medium text-foreground underline underline-offset-2"
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
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

interface TaskEditContentProps {
  selectedTask: KanbanTask;
  editLabels: string[];
  editLabelInput: string;
  editLabelSuggestions: string[];
  editDescription: string;
  newBlockedFollowUpEntry: string;
  isUpdatingTask: boolean;
  isSubmittingAttachment: boolean;
  hasPendingAttachmentUploads: boolean;
  pendingAttachmentUploads: PendingAttachmentUpload[];
  isLinkComposerOpen: boolean;
  linkUrl: string;
  fileInputKey: number;
  attachmentError: string | null;
  taskModalError: string | null;
  onEditLabelInputChange: (value: string) => void;
  onAddEditLabel: (value: string) => void;
  onRemoveEditLabel: (label: string) => void;
  onEditDescriptionChange: (value: string) => void;
  onNewBlockedFollowUpEntryChange: (value: string) => void;
  onAddBlockedFollowUpEntry: () => void | Promise<void>;
  onPreviewAttachment: (attachment: TaskAttachment | null) => void;
  onDeleteAttachment: (attachmentId: string) => void | Promise<void>;
  onToggleLinkComposer: () => void;
  onAddFileAttachment: (file: File | null) => void | Promise<void>;
  onLinkUrlChange: (value: string) => void;
  onAddLinkAttachment: () => void | Promise<void>;
  onSaveTask: () => void | Promise<void>;
  onCancelEdit: () => void;
}

function TaskEditContent({
  selectedTask,
  editLabels,
  editLabelInput,
  editLabelSuggestions,
  editDescription,
  newBlockedFollowUpEntry,
  isUpdatingTask,
  isSubmittingAttachment,
  hasPendingAttachmentUploads,
  pendingAttachmentUploads,
  isLinkComposerOpen,
  linkUrl,
  fileInputKey,
  attachmentError,
  taskModalError,
  onEditLabelInputChange,
  onAddEditLabel,
  onRemoveEditLabel,
  onEditDescriptionChange,
  onNewBlockedFollowUpEntryChange,
  onAddBlockedFollowUpEntry,
  onPreviewAttachment,
  onDeleteAttachment,
  onToggleLinkComposer,
  onAddFileAttachment,
  onLinkUrlChange,
  onAddLinkAttachment,
  onSaveTask,
  onCancelEdit,
}: TaskEditContentProps) {
  return (
    <>
      <div className="grid gap-2">
        <label htmlFor="task-edit-label-input" className="text-sm font-medium">
          Labels
        </label>
        <div className="rounded-md border border-input bg-background p-2">
          <div className="flex flex-wrap gap-2">
            {editLabels.map((label) => (
              <span
                key={label}
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-slate-900"
                style={{
                  backgroundColor: getTaskLabelColor(label),
                }}
              >
                {label}
                <button
                  type="button"
                  className="rounded-sm p-0.5 hover:bg-slate-900/10"
                  onClick={() => onRemoveEditLabel(label)}
                  aria-label={`Remove label ${label}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <input
              id="task-edit-label-input"
              value={editLabelInput}
              onChange={(event) => onEditLabelInputChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === ",") {
                  event.preventDefault();
                  onAddEditLabel(editLabelInput);
                }
              }}
              maxLength={60}
              className="h-8 min-w-[160px] flex-1 bg-transparent px-1 text-sm outline-none"
              placeholder={
                editLabels.length >= MAX_TASK_LABELS
                  ? "Label limit reached"
                  : "Type label and press Enter"
              }
              disabled={editLabels.length >= MAX_TASK_LABELS}
            />
          </div>
        </div>
        {editLabelSuggestions.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {editLabelSuggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => onAddEditLabel(suggestion)}
                className="rounded-full border border-border/70 bg-background px-2 py-1 text-xs text-foreground hover:bg-muted"
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="grid gap-2">
        <label className="text-sm font-medium">Description</label>
        <RichTextEditor
          id={`task-description-editor-${selectedTask.id}`}
          value={editDescription}
          onChange={onEditDescriptionChange}
          placeholder="Task details..."
        />
      </div>

      {selectedTask.status === "Blocked" ? (
        <div className="grid gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2">
          {selectedTask.blockedFollowUps.length === 0 ? (
            <p className="text-xs text-amber-700/80 dark:text-amber-200/90">
              No follow-up entries yet.
            </p>
          ) : (
            <div className="space-y-1.5">
              {selectedTask.blockedFollowUps.map((entry) => (
                <article
                  key={entry.id}
                  className="grid grid-cols-[90px_1fr] items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5"
                >
                  <p className="text-[11px] font-medium text-amber-800/90 dark:text-amber-100/90">
                    {formatFollowUpTimestamp(entry.createdAt)}
                  </p>
                  <p className="whitespace-pre-wrap break-words text-[13px] text-amber-900 dark:text-amber-100">
                    {entry.content}
                  </p>
                </article>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              value={newBlockedFollowUpEntry}
              onChange={(event) => onNewBlockedFollowUpEntryChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void onAddBlockedFollowUpEntry();
                }
              }}
              maxLength={1200}
              placeholder="Add follow-up and press Enter"
              className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm"
              disabled={isUpdatingTask}
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => void onAddBlockedFollowUpEntry()}
              disabled={isUpdatingTask || !newBlockedFollowUpEntry.trim()}
            >
              Add
            </Button>
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        {selectedTask.attachments.length === 0 ? (
          <p className="text-xs text-muted-foreground">No attachments yet.</p>
        ) : (
          <div className="space-y-2">
            {selectedTask.attachments.map((attachment) => {
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
                      disabled={isSubmittingAttachment || hasPendingAttachmentUploads}
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
        {pendingAttachmentUploads.length > 0 ? (
          <div className="space-y-2">
            {pendingAttachmentUploads.map((upload) => (
              <div
                key={upload.id}
                className="flex items-center justify-between gap-2 rounded-md border border-dashed border-border/70 bg-muted/20 px-2 py-1.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-foreground">{upload.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Uploading... {formatAttachmentFileSize(upload.sizeBytes)}
                  </p>
                </div>
                <Upload className="h-4 w-4 animate-pulse text-muted-foreground" />
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={isLinkComposerOpen ? "secondary" : "ghost"}
            size="icon"
            onClick={onToggleLinkComposer}
            disabled={isSubmittingAttachment || hasPendingAttachmentUploads}
            aria-label="Add attachment link"
          >
            <Link2 className="h-4 w-4" />
          </Button>
          <input
            key={fileInputKey}
            id="task-edit-attachment-file"
            type="file"
            onChange={(event) => void onAddFileAttachment(event.target.files?.[0] ?? null)}
            className="hidden"
          />
          <Button type="button" variant="ghost" size="icon" asChild>
            <label
              htmlFor="task-edit-attachment-file"
              aria-label="Upload attachment file"
              className="cursor-pointer"
            >
              <Upload className="h-4 w-4" />
            </label>
          </Button>
        </div>

        {isLinkComposerOpen ? (
          <div className="flex items-center gap-2 rounded-md border border-border/60 bg-background p-2">
            <input
              value={linkUrl}
              onChange={(event) => onLinkUrlChange(event.target.value)}
              placeholder="https://..."
              className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-xs"
            />
            <Button
              type="button"
              size="icon"
              variant="secondary"
              onClick={() => void onAddLinkAttachment()}
              disabled={isSubmittingAttachment || hasPendingAttachmentUploads || !linkUrl.trim()}
              aria-label="Confirm attachment link"
            >
              <Link2 className="h-4 w-4" />
            </Button>
          </div>
        ) : null}

        {attachmentError ? (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {attachmentError}
          </div>
        ) : null}
      </div>

      {taskModalError ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {taskModalError}
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <Button type="button" onClick={() => void onSaveTask()} disabled={isUpdatingTask}>
          {isUpdatingTask ? "Saving..." : "Save changes"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onCancelEdit}
          disabled={isUpdatingTask}
        >
          Cancel
        </Button>
      </div>
    </>
  );
}
