import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Archive,
  ArrowRightLeft,
  Check,
  ChevronRight,
  Clock3,
  Flag,
  Link2,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Trash2,
  TriangleAlert,
  Undo2,
  Upload,
  X,
} from "lucide-react";

import {
  type KanbanTask,
  type TaskComment,
  type PendingAttachmentUpload,
  type ProjectEpicOption,
  type ProjectTaskCollaborator,
  type TaskPersonSummary,
  type TaskAttachment,
} from "@/components/kanban-board-types";
import {
  formatFollowUpTimestamp,
  resolveAttachmentHref,
} from "@/components/kanban-board-utils";
import {
  RelatedTaskPill,
  RelatedTaskSelector,
  type RelatedTaskOption,
} from "@/components/kanban/related-task-field";
import { TaskDeadlineField } from "@/components/kanban/task-deadline-field";
import { AttachmentPreviewModal } from "@/components/attachment-preview-modal";
import { RichTextContent } from "@/components/rich-text-content";
import { RichTextEditor } from "@/components/rich-text-editor";
import { Badge } from "@/components/ui/badge";
import { AssigneeSelect } from "@/components/ui/assignee-select";
import { AttachmentLinkComposer } from "@/components/ui/attachment-link-composer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { EmojiInputField, EmojiTextareaField } from "@/components/ui/emoji-field";
import { EpicSelect } from "@/components/ui/epic-select";
import { UserAvatar } from "@/components/ui/user-avatar";
import { getEpicColorFromName } from "@/lib/epic";
import { useDismissibleMenu } from "@/lib/hooks/use-dismissible-menu";
import {
  ATTACHMENT_KIND_FILE,
  ATTACHMENT_KIND_LINK,
  formatAttachmentFileSize,
  isAttachmentPreviewable,
} from "@/lib/task-attachment";
import {
  formatTaskDeadlineForDisplay,
  getTaskDeadlineDayDelta,
  getTaskDeadlineUrgency,
  type TaskDeadlineUrgency,
} from "@/lib/task-deadline";
import { MAX_TASK_LABELS, getTaskLabelColor } from "@/lib/task-label";
import { TASK_STATUSES, type TaskStatus } from "@/lib/task-status";

interface TaskDetailModalProps {
  canEdit: boolean;
  isOpen: boolean;
  selectedTask: KanbanTask | null;
  isEditMode: boolean;
  editTitle: string;
  editLabels: string[];
  editLabelInput: string;
  editLabelSuggestions: string[];
  editDescription: string;
  editDeadlineDate: string;
  editEpicId: string;
  editAssigneeUserId: string;
  editRelatedTasks: KanbanTask["relatedTasks"];
  relatedTaskSearch: string;
  newBlockedFollowUpEntry: string;
  isUpdatingTask: boolean;
  taskModalError: string | null;
  attachmentError: string | null;
  isSubmittingAttachment: boolean;
  isArchivingTask: boolean;
  isArchivedTask: boolean;
  hasPendingAttachmentUploads: boolean;
  pendingAttachmentUploads: PendingAttachmentUpload[];
  isLinkComposerOpen: boolean;
  linkUrl: string;
  fileInputKey: number;
  previewAttachment: TaskAttachment | null;
  taskComments: TaskComment[];
  taskCommentsError: string | null;
  isLoadingTaskComments: boolean;
  newTaskComment: string;
  isSubmittingTaskComment: boolean;
  onClose: () => void;
  onActivateEditMode: () => void;
  onToggleEditMode: (nextValue: boolean) => void;
  onEditTitleChange: (value: string) => void;
  onEditLabelInputChange: (value: string) => void;
  onAddEditLabel: (value: string) => void;
  onRemoveEditLabel: (label: string) => void;
  onEditDescriptionChange: (value: string) => void;
  onEditDeadlineDateChange: (value: string) => void;
  onEditEpicIdChange: (value: string) => void;
  onEditAssigneeUserIdChange: (value: string) => void;
  onRelatedTaskSearchChange: (value: string) => void;
  onAddRelatedTask: (taskId: string) => void;
  onRemoveRelatedTask: (taskId: string) => void;
  availableEpicOptions: ProjectEpicOption[];
  availableAssignees: ProjectTaskCollaborator[];
  availableRelatedTaskOptions: RelatedTaskOption[];
  onOpenRelatedTask: (taskId: string) => void;
  onNewBlockedFollowUpEntryChange: (value: string) => void;
  onAddBlockedFollowUpEntry: () => void | Promise<void>;
  onSaveTask: () => void | Promise<void>;
  onQuickEpicChange: (value: string) => void | Promise<void>;
  onToggleLinkComposer: () => void;
  onLinkUrlChange: (value: string) => void;
  onAddLinkAttachment: () => void | Promise<void>;
  onAddFileAttachment: (file: File | null) => void | Promise<void>;
  onDeleteAttachment: (attachmentId: string) => void | Promise<void>;
  onPreviewAttachmentChange: (attachment: TaskAttachment | null) => void;
  onNewTaskCommentChange: (value: string) => void;
  onSubmitTaskComment: () => void | Promise<void>;
  onMoveTask: (nextStatus: TaskStatus) => void;
  onArchiveTask: () => void | Promise<void>;
  onUnarchiveTask: () => void | Promise<void>;
  onRequestDeleteTask: () => void;
}

export function TaskDetailModal({
  canEdit,
  isOpen,
  selectedTask,
  isEditMode,
  editTitle,
  editLabels,
  editLabelInput,
  editLabelSuggestions,
  editDescription,
  editDeadlineDate,
  editEpicId,
  editAssigneeUserId,
  editRelatedTasks,
  relatedTaskSearch,
  newBlockedFollowUpEntry,
  isUpdatingTask,
  taskModalError,
  attachmentError,
  isSubmittingAttachment,
  isArchivingTask,
  isArchivedTask,
  hasPendingAttachmentUploads,
  pendingAttachmentUploads,
  isLinkComposerOpen,
  linkUrl,
  fileInputKey,
  previewAttachment,
  taskComments,
  taskCommentsError,
  isLoadingTaskComments,
  newTaskComment,
  isSubmittingTaskComment,
  onClose,
  onActivateEditMode,
  onToggleEditMode,
  onEditTitleChange,
  onEditLabelInputChange,
  onAddEditLabel,
  onRemoveEditLabel,
  onEditDescriptionChange,
  onEditDeadlineDateChange,
  onEditEpicIdChange,
  onEditAssigneeUserIdChange,
  onRelatedTaskSearchChange,
  onAddRelatedTask,
  onRemoveRelatedTask,
  availableEpicOptions,
  availableAssignees,
  availableRelatedTaskOptions,
  onOpenRelatedTask,
  onNewBlockedFollowUpEntryChange,
  onAddBlockedFollowUpEntry,
  onSaveTask,
  onQuickEpicChange,
  onToggleLinkComposer,
  onLinkUrlChange,
  onAddLinkAttachment,
  onAddFileAttachment,
  onDeleteAttachment,
  onPreviewAttachmentChange,
  onNewTaskCommentChange,
  onSubmitTaskComment,
  onMoveTask,
  onArchiveTask,
  onUnarchiveTask,
  onRequestDeleteTask,
}: TaskDetailModalProps) {
  if (!isOpen || !selectedTask) {
    return null;
  }

  const isEditing = canEdit && isEditMode;

  return (
    <>
      {createPortal(
        <div
          data-calendar-popover-scope="true"
          className="fixed inset-0 z-[90] flex min-h-dvh w-screen items-end justify-center overflow-y-auto overscroll-y-contain bg-black/70 p-0 sm:items-center sm:p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              onClose();
            }
          }}
        >
          <Card
            className="flex max-h-[100dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl sm:max-h-[calc(100vh-2rem)] sm:rounded-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <CardHeader className="flex shrink-0 flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1 space-y-2">
                <Badge
                  variant="outline"
                  className={
                    isArchivedTask
                      ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : undefined
                  }
                >
                  {isArchivedTask ? "Archived" : selectedTask.status}
                </Badge>
                {!isEditing ? (
                  <div className="space-y-3">
                    <CardTitle
                      className="min-w-0 flex-1 text-xl leading-tight"
                      onDoubleClick={() => {
                        if (!canEdit) {
                          return;
                        }

                        onActivateEditMode();
                      }}
                    >
                      {selectedTask.title}
                    </CardTitle>
                    <div className="flex flex-wrap items-center gap-2">
                      {selectedTask.epic ? <TaskEpicBadge epic={selectedTask.epic} /> : null}
                      <TaskAssigneeBadge assignee={selectedTask.assignee} />
                    </div>
                  </div>
                ) : (
                  <EmojiInputField
                    aria-label="Task title"
                    value={editTitle}
                    onChange={(event) => onEditTitleChange(event.target.value)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  />
                )}
              </div>
              <div className="flex items-center gap-1 self-end sm:self-auto">
                {!isEditing && canEdit ? (
                  <TaskOptionsMenu
                    currentStatus={selectedTask.status}
                    currentEpic={selectedTask.epic}
                    epicOptions={availableEpicOptions}
                    isArchived={isArchivedTask}
                    isMutating={isArchivingTask || isUpdatingTask}
                    onStartEdit={() => onToggleEditMode(true)}
                    onQuickEpicChange={onQuickEpicChange}
                    onMoveTask={onMoveTask}
                    onArchiveTask={onArchiveTask}
                    onUnarchiveTask={onUnarchiveTask}
                    onRequestDeleteTask={onRequestDeleteTask}
                  />
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
            <CardContent className="min-h-0 flex-1 overflow-hidden">
              {!isEditing ? (
                <div className="h-full space-y-4 overflow-x-hidden overflow-y-auto pr-1">
                  <TaskReadOnlyContent
                    canEdit={canEdit}
                    selectedTask={selectedTask}
                    taskComments={taskComments}
                    taskCommentsError={taskCommentsError}
                    isLoadingTaskComments={isLoadingTaskComments}
                    newTaskComment={newTaskComment}
                    isSubmittingTaskComment={isSubmittingTaskComment}
                    onPreviewAttachment={onPreviewAttachmentChange}
                    onActivateEditMode={onActivateEditMode}
                    onOpenRelatedTask={onOpenRelatedTask}
                    onNewTaskCommentChange={onNewTaskCommentChange}
                    onSubmitTaskComment={onSubmitTaskComment}
                  />
                </div>
              ) : (
                <TaskEditContent
                  selectedTask={selectedTask}
                  editLabels={editLabels}
                  editLabelInput={editLabelInput}
                  editLabelSuggestions={editLabelSuggestions}
                  editDescription={editDescription}
                  editDeadlineDate={editDeadlineDate}
                  editEpicId={editEpicId}
                  editAssigneeUserId={editAssigneeUserId}
                  editRelatedTasks={editRelatedTasks}
                  relatedTaskSearch={relatedTaskSearch}
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
                  onEditDeadlineDateChange={onEditDeadlineDateChange}
                  onEditEpicIdChange={onEditEpicIdChange}
                  onEditAssigneeUserIdChange={onEditAssigneeUserIdChange}
                  onRelatedTaskSearchChange={onRelatedTaskSearchChange}
                  onAddRelatedTask={onAddRelatedTask}
                  onRemoveRelatedTask={onRemoveRelatedTask}
                  availableEpicOptions={availableEpicOptions}
                  availableAssignees={availableAssignees}
                  availableRelatedTaskOptions={availableRelatedTaskOptions}
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

function getDeadlineToneClasses(urgency: TaskDeadlineUrgency): string {
  switch (urgency) {
    case "overdue":
      return "border-red-500/35 bg-red-500/10 text-red-700 dark:text-red-200";
    case "soon":
      return "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-200";
    default:
      return "border-border/60 bg-muted/20 text-muted-foreground";
  }
}

function getDeadlineRelativeLabel(deadlineDate: string): string {
  const dayDelta = getTaskDeadlineDayDelta(deadlineDate);
  if (dayDelta === null) {
    return "";
  }

  if (dayDelta < 0) {
    return dayDelta === -1 ? "Overdue since yesterday" : `Overdue by ${Math.abs(dayDelta)} days`;
  }

  if (dayDelta === 0) {
    return "Due today";
  }

  if (dayDelta === 1) {
    return "Due tomorrow";
  }

  return `Due in ${dayDelta} days`;
}

function TaskDeadlineBadge({
  deadlineDate,
  status,
  archivedAt,
  compact = false,
}: {
  deadlineDate: string | null;
  status: string;
  archivedAt: string | null;
  compact?: boolean;
}) {
  if (!deadlineDate) {
    return null;
  }

  const urgency = getTaskDeadlineUrgency({
    deadlineDate,
    status,
    archivedAt,
  });
  const relativeLabel = getDeadlineRelativeLabel(deadlineDate);
  const label = formatTaskDeadlineForDisplay(deadlineDate);

  return (
    <div
      className={[
        "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium",
        getDeadlineToneClasses(urgency),
        compact ? "px-2 py-0.5 text-[11px]" : "",
      ].join(" ")}
      title={relativeLabel ? `${relativeLabel} (${label})` : label}
      aria-label={relativeLabel ? `${relativeLabel} (${label})` : `Deadline ${label}`}
    >
      <Clock3 className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
      <span>{label}</span>
      {relativeLabel ? (
        <span className="hidden sm:inline">- {relativeLabel}</span>
      ) : null}
    </div>
  );
}

function formatTaskActivityDate(value: string): string {
  return new Date(value).toLocaleDateString();
}

function buildTaskPersonHoverLabel(person: TaskPersonSummary): string {
  return person.usernameTag ?? person.displayName;
}

function TaskEpicBadge({
  epic,
  showLabel = true,
}: {
  epic: KanbanTask["epic"];
  showLabel?: boolean;
}) {
  if (!epic) {
    return null;
  }

  const color = getEpicColorFromName(epic.name);

  return (
    <div className="flex flex-col gap-1 sm:items-end">
      {showLabel ? (
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Epic
        </p>
      ) : null}
      <div
        className="inline-flex max-w-full items-center gap-2 rounded-full border px-2.5 py-1.5"
        style={{
          backgroundColor: color.soft,
          borderColor: color.border,
          color: color.accent,
        }}
        title={epic.name}
      >
        <Flag className="h-3.5 w-3.5" />
        <span className="max-w-[180px] truncate text-sm font-medium">{epic.name}</span>
      </div>
    </div>
  );
}

function TaskAssigneeBadge({ assignee }: { assignee: TaskPersonSummary | null }) {
  return (
    <div className="flex flex-col gap-1 sm:items-end">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        Assignee
      </p>
      <div
        className="inline-flex max-w-full items-center gap-2 rounded-full border border-border/60 bg-background/85 px-2.5 py-1.5"
        title={assignee ? buildTaskPersonHoverLabel(assignee) : "Unassigned"}
      >
        {assignee ? (
          <>
            <UserAvatar
              avatarSeed={assignee.avatarSeed}
              displayName={assignee.displayName}
              className="h-7 w-7 border-border/70"
              decorative
            />
            <span className="max-w-[160px] truncate text-sm font-medium text-foreground">
              {assignee.displayName}
            </span>
          </>
        ) : (
          <>
            <span className="inline-flex h-7 w-7 shrink-0 rounded-full border border-dashed border-border/70 bg-muted/30" />
            <span className="text-sm text-muted-foreground">Unassigned</span>
          </>
        )}
      </div>
    </div>
  );
}

function TaskActivityInline({
  label,
  person,
  fallback,
  timestamp,
}: {
  label: string;
  person: TaskPersonSummary | null;
  fallback: string;
  timestamp: string;
}) {
  if (!person) {
    return (
      <div className="grid gap-1 rounded-xl border border-border/50 bg-background/75 px-2.5 py-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </p>
        <p className="text-xs text-muted-foreground">{fallback}</p>
      </div>
    );
  }

  return (
    <div
      className="grid min-w-0 gap-1 rounded-xl border border-border/50 bg-background/75 px-2.5 py-2"
      title={`${label}: ${buildTaskPersonHoverLabel(person)}`}
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <div className="flex min-w-0 items-center gap-1.5">
        <UserAvatar
          avatarSeed={person.avatarSeed}
          displayName={person.displayName}
          className="h-5 w-5 border-border/70"
          decorative
        />
        <span className="max-w-[96px] truncate text-xs font-medium text-foreground">
          {person.displayName}
        </span>
      </div>
      <span className="text-[11px] text-muted-foreground">
        {formatTaskActivityDate(timestamp)}
      </span>
    </div>
  );
}

interface TaskOptionsMenuProps {
  currentStatus: TaskStatus;
  currentEpic: KanbanTask["epic"];
  epicOptions: ProjectEpicOption[];
  isArchived: boolean;
  isMutating: boolean;
  onStartEdit: () => void;
  onQuickEpicChange: (value: string) => void | Promise<void>;
  onMoveTask: (nextStatus: TaskStatus) => void;
  onArchiveTask: () => void | Promise<void>;
  onUnarchiveTask: () => void | Promise<void>;
  onRequestDeleteTask: () => void;
}

function TaskOptionsMenu({
  currentStatus,
  currentEpic,
  epicOptions,
  isArchived,
  isMutating,
  onStartEdit,
  onQuickEpicChange,
  onMoveTask,
  onArchiveTask,
  onUnarchiveTask,
  onRequestDeleteTask,
}: TaskOptionsMenuProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeSubmenu, setActiveSubmenu] = useState<"move" | "epic" | null>(null);

  const closeMenu = () => {
    setIsMenuOpen(false);
    setActiveSubmenu(null);
  };

  const menuRef = useDismissibleMenu<HTMLDivElement>(isMenuOpen, closeMenu);

  return (
    <div ref={menuRef} className="relative">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Task options"
        aria-expanded={isMenuOpen}
        onClick={() => {
          setIsMenuOpen((previous) => {
            if (previous) {
              setActiveSubmenu(null);
            }

            return !previous;
          });
        }}
      >
        <MoreHorizontal className="h-4 w-4" />
      </Button>
      {isMenuOpen ? (
        <div className="absolute right-0 z-20 mt-1 w-40 rounded-md border border-border/70 bg-background p-1 shadow-md">
          <Button
            type="button"
            variant="ghost"
            className="w-full justify-start"
            disabled={isMutating}
            onClick={() => {
              onStartEdit();
              closeMenu();
            }}
          >
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
          {!isArchived ? (
            <div className="relative">
              <Button
                type="button"
                variant="ghost"
                className="w-full justify-between"
                disabled={isMutating}
                aria-haspopup="menu"
                aria-expanded={activeSubmenu === "move"}
                aria-controls="task-options-submenu-move"
                onClick={() =>
                  setActiveSubmenu((previous) => (previous === "move" ? null : "move"))
                }
              >
                <span className="inline-flex items-center gap-2">
                  <ArrowRightLeft className="h-4 w-4" />
                  Move to
                </span>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <div
                id="task-options-submenu-move"
                role="menu"
                className={[
                  "absolute right-full top-0 z-30 mr-1 w-36 rounded-md border border-border/70 bg-background p-1 shadow-md transition",
                  activeSubmenu === "move"
                    ? "visible pointer-events-auto opacity-100"
                    : "invisible pointer-events-none opacity-0",
                ].join(" ")}
              >
                {TASK_STATUSES.map((nextStatus) => (
                  <Button
                    key={nextStatus}
                    type="button"
                    variant="ghost"
                    className="w-full justify-start"
                    disabled={nextStatus === currentStatus || isMutating}
                    onClick={() => {
                      onMoveTask(nextStatus);
                      closeMenu();
                    }}
                  >
                    {nextStatus}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="relative">
            <Button
              type="button"
              variant="ghost"
              className="w-full justify-between"
              aria-label="Epic options"
              disabled={isMutating}
              aria-haspopup="menu"
              aria-expanded={activeSubmenu === "epic"}
              aria-controls="task-options-submenu-epic"
              onClick={() =>
                setActiveSubmenu((previous) => (previous === "epic" ? null : "epic"))
              }
            >
              <span className="inline-flex items-center gap-2">
                <Flag className="h-4 w-4" />
                Epic
              </span>
              <span className="inline-flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                <span className="max-w-[76px] truncate">{currentEpic?.name ?? "None"}</span>
                <ChevronRight className="h-4 w-4 shrink-0" />
              </span>
            </Button>
            <div
              id="task-options-submenu-epic"
              role="menu"
              data-task-options-submenu="epic"
              className={[
                "absolute right-full top-0 z-30 mr-1 w-64 rounded-md border border-border/70 bg-background p-1 shadow-md transition",
                activeSubmenu === "epic"
                  ? "visible pointer-events-auto opacity-100"
                  : "invisible pointer-events-none opacity-0",
              ].join(" ")}
            >
              <div className="max-h-72 space-y-1 overflow-y-auto">
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full justify-between"
                  disabled={!currentEpic || isMutating}
                  onClick={() => {
                    void onQuickEpicChange("");
                    closeMenu();
                  }}
                >
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-dashed border-border/70 bg-muted/30">
                      <Flag className="h-3.5 w-3.5 text-muted-foreground" />
                    </span>
                    <span className="min-w-0 text-left">
                      <span className="block truncate text-sm font-medium">No epic</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        Leave this task outside an epic
                      </span>
                    </span>
                  </span>
                  {!currentEpic ? <Check className="h-4 w-4" /> : null}
                </Button>

                {epicOptions.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">
                    Create an epic in the Epics section to link it here.
                  </p>
                ) : (
                  epicOptions.map((epic) => {
                    const color = getEpicColorFromName(epic.name);
                    const isSelected = epic.id === currentEpic?.id;

                    return (
                      <Button
                        key={epic.id}
                        type="button"
                        variant="ghost"
                        className="h-auto w-full justify-between py-2"
                        disabled={isSelected || isMutating}
                        onClick={() => {
                          void onQuickEpicChange(epic.id);
                          closeMenu();
                        }}
                      >
                        <span className="inline-flex min-w-0 items-center gap-2">
                          <span
                            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border"
                            style={{
                              backgroundColor: color.soft,
                              borderColor: color.border,
                              color: color.accent,
                            }}
                          >
                            <Flag className="h-3.5 w-3.5" />
                          </span>
                          <span className="min-w-0 text-left">
                            <span className="block truncate text-sm font-medium">{epic.name}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {epic.status} · {epic.progressPercent}% complete · {epic.taskCount} task
                              {epic.taskCount === 1 ? "" : "s"}
                            </span>
                          </span>
                        </span>
                        {isSelected ? <Check className="h-4 w-4" /> : null}
                      </Button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
          {currentStatus === "Done" && !isArchived ? (
            <Button
              type="button"
              variant="ghost"
              className="w-full justify-start"
              disabled={isMutating}
              onClick={() => {
                void onArchiveTask();
                closeMenu();
              }}
            >
              <Archive className="h-4 w-4" />
              {isMutating ? "Working..." : "Archive"}
            </Button>
          ) : null}
          {isArchived ? (
            <Button
              type="button"
              variant="ghost"
              className="w-full justify-start"
              disabled={isMutating}
              onClick={() => {
                void onUnarchiveTask();
                closeMenu();
              }}
            >
              <Undo2 className="h-4 w-4" />
              Unarchive
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            className="w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={isMutating}
            onClick={() => {
              closeMenu();
              onRequestDeleteTask();
            }}
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function TaskReadOnlyContent({
  canEdit,
  selectedTask,
  taskComments,
  taskCommentsError,
  isLoadingTaskComments,
  newTaskComment,
  isSubmittingTaskComment,
  onPreviewAttachment,
  onActivateEditMode,
  onOpenRelatedTask,
  onNewTaskCommentChange,
  onSubmitTaskComment,
}: {
  canEdit: boolean;
  selectedTask: KanbanTask;
  taskComments: TaskComment[];
  taskCommentsError: string | null;
  isLoadingTaskComments: boolean;
  newTaskComment: string;
  isSubmittingTaskComment: boolean;
  onPreviewAttachment: (attachment: TaskAttachment | null) => void;
  onActivateEditMode: () => void;
  onOpenRelatedTask: (taskId: string) => void;
  onNewTaskCommentChange: (value: string) => void;
  onSubmitTaskComment: () => void | Promise<void>;
}) {
  const hasAttachments = selectedTask.attachments.length > 0;
  const hasRelatedTasks = selectedTask.relatedTasks.length > 0;
  const hasEpic = Boolean(selectedTask.epic);
  const commentInputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const textarea = commentInputRef.current;
    if (!textarea) {
      return;
    }

    const minHeight = 44;
    const maxHeight = 140;

    textarea.style.height = "0px";
    const nextHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = nextHeight >= maxHeight ? "auto" : "hidden";
  }, [newTaskComment]);

  return (
    <>
      <TaskDeadlineBadge
        deadlineDate={selectedTask.deadlineDate}
        status={selectedTask.status}
        archivedAt={selectedTask.archivedAt}
      />
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
      {hasEpic ? (
        <div className="grid gap-2 rounded-md border border-border/60 bg-muted/20 p-3">
          <p className="text-sm font-medium">Epic</p>
          <div className="flex flex-wrap gap-2">
            <TaskEpicBadge epic={selectedTask.epic} showLabel={false} />
          </div>
        </div>
      ) : null}
      {selectedTask.status === "Blocked" ? (
        <div
          className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-200"
          onDoubleClick={() => {
            if (!canEdit) {
              return;
            }

            onActivateEditMode();
          }}
        >
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
                  className="grid gap-1 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 sm:grid-cols-[90px_1fr] sm:gap-2"
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
      <RichTextContent
        html={selectedTask.description}
        emptyContentHtml="<p>No description provided.</p>"
        className="text-sm text-muted-foreground"
        onDoubleClick={() => {
          if (!canEdit) {
            return;
          }

          onActivateEditMode();
        }}
      />
      <section className="pt-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-medium">Comments</p>
            </div>
            <span className="text-xs text-muted-foreground">
              {selectedTask.commentCount} comment{selectedTask.commentCount === 1 ? "" : "s"}
            </span>
          </div>

          {isLoadingTaskComments ? (
            <p className="text-xs text-muted-foreground">Loading comments...</p>
          ) : taskComments.length > 0 ? (
            <div className="space-y-2.5">
              {taskComments.map((comment) => (
                <article
                  key={comment.id}
                  className="rounded-xl border border-border/50 bg-background/80 px-3 py-2"
                >
                  <div className="flex items-start gap-2.5">
                    <UserAvatar
                      avatarSeed={comment.author.avatarSeed}
                      displayName={comment.author.displayName}
                      className="mt-0.5 h-8 w-8 border-border/70"
                      decorative
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="text-sm font-medium">{comment.author.displayName}</p>
                        {getCommentIdentityMeta(comment.author) ? (
                          <p className="text-[11px] text-muted-foreground">
                            {getCommentIdentityMeta(comment.author)}
                          </p>
                        ) : null}
                        <p className="text-[11px] text-muted-foreground">
                          {formatTaskCommentTimestamp(comment.createdAt)}
                        </p>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground">
                        {comment.content}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : !canEdit ? (
            <p className="text-xs text-muted-foreground">No comments yet.</p>
          ) : null}

          {taskCommentsError ? (
            <p className="text-xs text-destructive">{taskCommentsError}</p>
          ) : null}

          {canEdit ? (
            <div className="space-y-2">
              <label htmlFor="task-comment-input" className="sr-only">
                Task comment
              </label>
              <EmojiTextareaField
                ref={commentInputRef}
                id="task-comment-input"
                aria-label="Task comment"
                value={newTaskComment}
                onChange={(event) => onNewTaskCommentChange(event.target.value)}
                maxLength={4000}
                rows={1}
                placeholder="Add a task comment..."
                wrapperClassName="w-full"
                className="h-11 min-h-11 resize-none rounded-xl border border-border/50 bg-background/80 px-3 py-2 text-sm leading-5 transition-colors focus-visible:outline-none focus-visible:border-ring/60"
                disabled={isSubmittingTaskComment}
              />
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <TaskActivityInline
                    label="Created by"
                    person={selectedTask.createdBy}
                    fallback="Unknown creator"
                    timestamp={selectedTask.createdAt}
                  />
                  <TaskActivityInline
                    label="Last updated by"
                    person={selectedTask.updatedBy}
                    fallback="Unknown collaborator"
                    timestamp={selectedTask.updatedAt}
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void onSubmitTaskComment()}
                  disabled={isSubmittingTaskComment || !newTaskComment.trim()}
                  className="w-full sm:w-auto"
                >
                  {isSubmittingTaskComment ? "Posting..." : "Add comment"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <TaskActivityInline
                label="Created by"
                person={selectedTask.createdBy}
                fallback="Unknown creator"
                timestamp={selectedTask.createdAt}
              />
              <TaskActivityInline
                label="Last updated by"
                person={selectedTask.updatedBy}
                fallback="Unknown collaborator"
                timestamp={selectedTask.updatedAt}
              />
            </div>
          )}
        </div>
      </section>
      {hasAttachments ? (
        <div className="grid gap-2 rounded-md border border-border/60 bg-muted/20 p-3">
          <p className="text-sm font-medium">Attachments</p>
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
        </div>
      ) : null}
      {hasRelatedTasks ? (
        <div className="grid gap-2 rounded-md border border-border/60 bg-muted/20 p-3">
          <p className="text-sm font-medium">Related tasks</p>
          <div className="flex flex-wrap gap-2">
            {selectedTask.relatedTasks.map((task) => (
              <RelatedTaskPill
                key={task.id}
                task={task}
                onClick={() => onOpenRelatedTask(task.id)}
              />
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}

interface TaskEditContentProps {
  selectedTask: KanbanTask;
  editLabels: string[];
  editLabelInput: string;
  editLabelSuggestions: string[];
  editDescription: string;
  editDeadlineDate: string;
  editEpicId: string;
  editAssigneeUserId: string;
  editRelatedTasks: KanbanTask["relatedTasks"];
  relatedTaskSearch: string;
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
  onEditDeadlineDateChange: (value: string) => void;
  onEditEpicIdChange: (value: string) => void;
  onEditAssigneeUserIdChange: (value: string) => void;
  onRelatedTaskSearchChange: (value: string) => void;
  onAddRelatedTask: (taskId: string) => void;
  onRemoveRelatedTask: (taskId: string) => void;
  availableEpicOptions: ProjectEpicOption[];
  availableAssignees: ProjectTaskCollaborator[];
  availableRelatedTaskOptions: RelatedTaskOption[];
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
  editDeadlineDate,
  editEpicId,
  editAssigneeUserId,
  editRelatedTasks,
  relatedTaskSearch,
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
  onEditDeadlineDateChange,
  onEditEpicIdChange,
  onEditAssigneeUserIdChange,
  onRelatedTaskSearchChange,
  onAddRelatedTask,
  onRemoveRelatedTask,
  availableEpicOptions,
  availableAssignees,
  availableRelatedTaskOptions,
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
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-x-hidden overflow-y-auto pr-1">
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
              <EmojiInputField
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
                wrapperClassName="min-w-[120px] flex-1 sm:min-w-[160px]"
                className="h-8 min-w-[120px] flex-1 bg-transparent px-1 text-sm outline-none sm:min-w-[160px]"
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

        <TaskDeadlineField
          id="task-edit-deadline"
          label="Deadline"
          value={editDeadlineDate}
          onChange={onEditDeadlineDateChange}
          disabled={isUpdatingTask}
        />

        <div className="grid gap-2">
          <label htmlFor="task-edit-epic" className="text-sm font-medium">
            Epic
          </label>
          <EpicSelect
            id="task-edit-epic"
            value={editEpicId}
            onChange={onEditEpicIdChange}
            disabled={isUpdatingTask}
            options={availableEpicOptions}
          />
        </div>

        <div className="grid gap-2">
          <label htmlFor="task-edit-assignee" className="text-sm font-medium">
            Assignee
          </label>
          <AssigneeSelect
            id="task-edit-assignee"
            value={editAssigneeUserId}
            onChange={onEditAssigneeUserIdChange}
            disabled={isUpdatingTask}
            options={availableAssignees}
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
                    className="grid gap-1 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 sm:grid-cols-[90px_1fr] sm:gap-2"
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

            <p className="text-xs font-medium uppercase tracking-[0.18em] text-amber-800/80 dark:text-amber-100/80">
              New follow-up
            </p>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <EmojiInputField
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
                wrapperClassName="flex-1"
                className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                disabled={isUpdatingTask}
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => void onAddBlockedFollowUpEntry()}
                disabled={isUpdatingTask || !newBlockedFollowUpEntry.trim()}
                className="w-full sm:w-auto"
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
              aria-label="Open attachment link input"
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
            <AttachmentLinkComposer
              value={linkUrl}
              onValueChange={onLinkUrlChange}
              onSubmit={onAddLinkAttachment}
              isSubmitDisabled={
                isSubmittingAttachment || hasPendingAttachmentUploads || !linkUrl.trim()
              }
            />
          ) : null}

          {attachmentError ? (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {attachmentError}
            </div>
          ) : null}
        </div>

        <div className="grid gap-2">
          <label className="text-sm font-medium">Related tasks</label>
          <RelatedTaskSelector
            selectedTasks={editRelatedTasks}
            availableTasks={availableRelatedTaskOptions}
            searchValue={relatedTaskSearch}
            onSearchChange={onRelatedTaskSearchChange}
            onAddTask={onAddRelatedTask}
            onRemoveTask={onRemoveRelatedTask}
          />
        </div>
      </div>

      <CardFooter
        data-calendar-popover-footer-boundary="true"
        className="shrink-0 border-t border-border/60 bg-card/95 px-0 pb-0 pt-4 backdrop-blur supports-[backdrop-filter]:bg-card/90"
      >
        <div className="flex w-full flex-col gap-3">
          {taskModalError ? (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {taskModalError}
            </div>
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
            <Button
              type="button"
              onClick={() => void onSaveTask()}
              disabled={isUpdatingTask}
              className="w-full sm:w-auto"
            >
              {isUpdatingTask ? "Saving..." : "Save changes"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={onCancelEdit}
              disabled={isUpdatingTask}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
          </div>
        </div>
      </CardFooter>
    </div>
  );
}

function formatTaskCommentTimestamp(createdAt: string): string {
  return new Date(createdAt).toLocaleString();
}

function getCommentIdentityMeta(author: TaskComment["author"]): string | null {
  if (!author.usernameTag || author.usernameTag === author.displayName) {
    return null;
  }

  return author.usernameTag;
}
