import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd";
import {
  useEffect,
  useId,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Flag,
  GripVertical,
  Link2,
  MessageSquare,
  Paperclip,
  TriangleAlert,
} from "lucide-react";

import type {
  KanbanTask,
  ProjectTaskCollaborator,
} from "@/components/kanban-board-types";
import { AgentAvatar } from "@/components/ui/agent-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { UserAvatar } from "@/components/ui/user-avatar";
import { getEpicColorFromName } from "@/lib/epic";
import { renderContentWithMentions } from "@/lib/content-with-mentions";
import {
  buildDragStyle,
  getDescriptionPreview,
  type TaskColumns,
} from "@/components/kanban-board-utils";
import { TASK_STATUS_BADGE_CLASS_NAMES } from "@/components/kanban/task-status-presentation";
import {
  formatTaskDeadlineForDisplay,
  getTaskDeadlineUrgency,
  type TaskDeadlineUrgency,
} from "@/lib/task-deadline";
import { getTaskLabelColor } from "@/lib/task-label";
import { TASK_STATUSES, type TaskStatus } from "@/lib/task-status";
import { cn } from "@/lib/utils";

const COLUMN_CHROME: Record<
  TaskStatus,
  {
    accent: string;
    column: string;
    dragState: string;
    emptyCopy: string;
  }
> = {
  Backlog: {
    accent: "bg-slate-400/80 dark:bg-slate-300/70",
    column:
      "border-slate-200/70 bg-gradient-to-b from-slate-100/30 via-card to-card dark:border-slate-800/80 dark:from-slate-900/35",
    dragState: "bg-slate-100/50 dark:bg-slate-900/35",
    emptyCopy: "No tasks queued yet",
  },
  "In Progress": {
    accent: "bg-sky-500/80 dark:bg-sky-400/80",
    column:
      "border-sky-200/70 bg-gradient-to-b from-sky-100/35 via-card to-card dark:border-sky-950/80 dark:from-sky-950/30",
    dragState: "bg-sky-100/45 dark:bg-sky-950/30",
    emptyCopy: "No active work in flight",
  },
  Blocked: {
    accent: "bg-amber-500/85 dark:bg-amber-400/85",
    column:
      "border-amber-200/70 bg-gradient-to-b from-amber-100/35 via-card to-card dark:border-amber-950/80 dark:from-amber-950/30",
    dragState: "bg-amber-100/45 dark:bg-amber-950/30",
    emptyCopy: "Nothing blocked right now",
  },
  Done: {
    accent: "bg-emerald-500/80 dark:bg-emerald-400/80",
    column:
      "border-emerald-200/70 bg-gradient-to-b from-emerald-100/35 via-card to-card dark:border-emerald-950/80 dark:from-emerald-950/28",
    dragState: "bg-emerald-100/45 dark:bg-emerald-950/28",
    emptyCopy: "Nothing finished yet",
  },
};

const SLIM_SCROLLBAR_CLASSES = [
  "[scrollbar-color:rgba(148,163,184,0.52)_transparent]",
  "[scrollbar-width:thin]",
  "[&::-webkit-scrollbar]:w-2",
  "[&::-webkit-scrollbar-track]:rounded-full",
  "[&::-webkit-scrollbar-track]:bg-transparent",
  "[&::-webkit-scrollbar-thumb]:rounded-full",
  "[&::-webkit-scrollbar-thumb]:bg-[rgba(148,163,184,0.52)]",
].join(" ");

interface KanbanColumnsGridProps {
  canEdit: boolean;
  columns: TaskColumns<KanbanTask>;
  archivedDoneTasks: KanbanTask[];
  mentionUsers: ProjectTaskCollaborator[];
  highlightedTaskIds: Set<string>;
  isFiltering: boolean;
  onDragEnd: (result: DropResult) => void;
  onSelectTask: (task: KanbanTask) => void;
  onEditTask: (task: KanbanTask) => void;
  onTaskHoverChange: (taskId: string | null) => void;
}

type MobileLaneNavigationDirection = "previous" | "next";

function getMobileLaneNavigationButtonId(
  gridId: string,
  status: TaskStatus,
  direction: MobileLaneNavigationDirection
) {
  return `${gridId}-kanban-${status.toLowerCase().replaceAll(" ", "-")}-${direction}`;
}

export function KanbanColumnsGrid({
  canEdit,
  columns,
  archivedDoneTasks,
  mentionUsers,
  highlightedTaskIds,
  isFiltering,
  onDragEnd,
  onSelectTask,
  onEditTask,
  onTaskHoverChange,
}: KanbanColumnsGridProps) {
  const gridId = useId();
  const [mobileLaneState, setMobileLaneState] = useState<{
    activeStatus: TaskStatus;
    focusDirection: MobileLaneNavigationDirection | null;
  }>({ activeStatus: "Backlog", focusDirection: null });
  const activeMobileStatus = mobileLaneState.activeStatus;

  useEffect(() => {
    const direction = mobileLaneState.focusDirection;
    if (!direction) {
      return;
    }

    document
      .getElementById(
        getMobileLaneNavigationButtonId(
          gridId,
          mobileLaneState.activeStatus,
          direction
        )
      )
      ?.focus();
  }, [gridId, mobileLaneState]);

  function navigateMobileLane(
    status: TaskStatus,
    focusDirection: MobileLaneNavigationDirection
  ) {
    setMobileLaneState({ activeStatus: status, focusDirection });
  }

  const activeMobileTaskCount =
    columns[activeMobileStatus].length +
    (activeMobileStatus === "Done" ? archivedDoneTasks.length : 0);

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <p className="sr-only xl:hidden" aria-live="polite" aria-atomic="true">
        Showing {activeMobileStatus} list, {activeMobileTaskCount}{" "}
        {activeMobileTaskCount === 1 ? "task" : "tasks"}
      </p>
      <div className="grid gap-4 xl:grid-cols-4">
        {TASK_STATUSES.map((status, index) => {
          const previousStatus = TASK_STATUSES[index - 1] ?? null;
          const nextStatus = TASK_STATUSES[index + 1] ?? null;

          return (
            <KanbanColumn
              canEdit={canEdit}
              key={status}
              status={status}
              tasks={columns[status]}
              archivedDoneTasks={status === "Done" ? archivedDoneTasks : []}
              mentionUsers={mentionUsers}
              highlightedTaskIds={highlightedTaskIds}
              isFiltering={isFiltering}
              previousStatus={previousStatus}
              nextStatus={nextStatus}
              mobileNavigationIdPrefix={gridId}
              onMobileNavigate={navigateMobileLane}
              onSelectTask={onSelectTask}
              onEditTask={onEditTask}
              onTaskHoverChange={onTaskHoverChange}
              className={cn(status !== activeMobileStatus && "hidden xl:flex")}
            />
          );
        })}
      </div>
    </DragDropContext>
  );
}

interface KanbanColumnProps {
  canEdit: boolean;
  status: TaskStatus;
  tasks: KanbanTask[];
  archivedDoneTasks: KanbanTask[];
  mentionUsers: ProjectTaskCollaborator[];
  highlightedTaskIds: Set<string>;
  isFiltering: boolean;
  previousStatus: TaskStatus | null;
  nextStatus: TaskStatus | null;
  mobileNavigationIdPrefix: string;
  onMobileNavigate: (
    status: TaskStatus,
    focusDirection: MobileLaneNavigationDirection
  ) => void;
  onSelectTask: (task: KanbanTask) => void;
  onEditTask: (task: KanbanTask) => void;
  onTaskHoverChange: (taskId: string | null) => void;
  className?: string;
}

function KanbanColumn({
  canEdit,
  status,
  tasks,
  archivedDoneTasks,
  mentionUsers,
  highlightedTaskIds,
  isFiltering,
  previousStatus,
  nextStatus,
  mobileNavigationIdPrefix,
  onMobileNavigate,
  onSelectTask,
  onEditTask,
  onTaskHoverChange,
  className,
}: KanbanColumnProps) {
  const chrome = COLUMN_CHROME[status];
  const laneTitleId = `kanban-lane-${status.toLowerCase().replaceAll(" ", "-")}-title`;
  // The archive is open when the user toggled it, or while filtering surfaces
  // archived matches unless the user explicitly dismissed that auto-open.
  // Auto-opening is derived (not stored), so ending filters returns the group
  // to the user's own open/closed state instead of leaving an auto-open behind.
  const [userArchiveOpen, setUserArchiveOpen] = useState(false);
  const [autoOpenDismissed, setAutoOpenDismissed] = useState(false);
  const autoOpenArchive = isFiltering && archivedDoneTasks.length > 0;
  const isArchiveOpen = userArchiveOpen || (autoOpenArchive && !autoOpenDismissed);

  useEffect(() => {
    setAutoOpenDismissed(false);
  }, [isFiltering]);

  return (
    <Card
      data-kanban-lane={status}
      data-kanban-status={status}
      className={cn(
        "flex h-[clamp(20rem,64dvh,42rem)] min-h-0 flex-col overflow-hidden border shadow-[0_18px_48px_-42px_rgba(15,23,42,0.7)]",
        chrome.column,
        className
      )}
    >
      <div className={cn("h-1.5 w-full shrink-0", chrome.accent)} />
      <CardHeader className="shrink-0 px-4 pb-3 xl:px-6">
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <Button
            id={getMobileLaneNavigationButtonId(
              mobileNavigationIdPrefix,
              status,
              "previous"
            )}
            type="button"
            variant="ghost"
            size="icon"
            className="h-11 w-11 shrink-0 rounded-full border border-border/60 bg-background/70 xl:hidden"
            aria-label={
              previousStatus
                ? `Previous list: ${previousStatus}`
                : "No previous list"
            }
            disabled={!previousStatus}
            onClick={() => {
              if (previousStatus) {
                onMobileNavigate(previousStatus, "next");
              }
            }}
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </Button>
          <span className="flex min-w-0 flex-1 items-center justify-center gap-2 xl:justify-between">
            <span id={laneTitleId} className="truncate">
              {status}
            </span>
            <Badge
              variant="outline"
              className={TASK_STATUS_BADGE_CLASS_NAMES[status]}
            >
              {tasks.length}
            </Badge>
          </span>
          <Button
            id={getMobileLaneNavigationButtonId(
              mobileNavigationIdPrefix,
              status,
              "next"
            )}
            type="button"
            variant="ghost"
            size="icon"
            className="h-11 w-11 shrink-0 rounded-full border border-border/60 bg-background/70 xl:hidden"
            aria-label={nextStatus ? `Next list: ${nextStatus}` : "No next list"}
            disabled={!nextStatus}
            onClick={() => {
              if (nextStatus) {
                onMobileNavigate(nextStatus, "previous");
              }
            }}
          >
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </Button>
        </CardTitle>
      </CardHeader>
      {status === "Done" && archivedDoneTasks.length > 0 ? (
        <div className="shrink-0 px-6 pb-3">
          <details
            className="rounded-xl border border-border/60 bg-background/55"
            open={isArchiveOpen}
            onToggle={(event) => {
              // React's own attribute sync also fires toggle; only treat a
              // change that contradicts the rendered state as a user action.
              const open = event.currentTarget.open;
              if (open === isArchiveOpen) {
                return;
              }
              if (open) {
                setUserArchiveOpen(true);
              } else {
                setUserArchiveOpen(false);
                if (autoOpenArchive) {
                  setAutoOpenDismissed(true);
                }
              }
            }}
          >
            <summary className="min-h-11 cursor-pointer rounded-xl px-3 py-3 text-xs font-medium text-muted-foreground transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
              Archive ({archivedDoneTasks.length})
            </summary>
            <div
              className={cn(
                "max-h-40 space-y-2 overflow-y-auto overscroll-y-contain border-t border-border/60 p-2 [scrollbar-gutter:stable] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                SLIM_SCROLLBAR_CLASSES
              )}
              aria-label="Archived Done tasks"
              role="region"
              tabIndex={0}
            >
              {archivedDoneTasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  className={cn(
                    "min-h-11 w-full rounded-md border border-border/60 bg-card px-2 py-2 text-left transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    highlightedTaskIds.has(task.id) &&
                      "border-border/80 bg-muted/35 shadow-[0_0_0_1px_rgba(148,163,184,0.08)]"
                  )}
                  onClick={() => onSelectTask(task)}
                  onMouseEnter={() => onTaskHoverChange(task.id)}
                  onMouseLeave={() => onTaskHoverChange(null)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-foreground/90">
                      <Archive
                        aria-hidden="true"
                        className="h-3.5 w-3.5 shrink-0 text-emerald-400/80"
                      />
                      <span className="truncate">{task.title}</span>
                    </p>
                    <span className="rounded-full border border-emerald-500/20 bg-emerald-500/5 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.18em] text-emerald-300/80">
                      Archived
                    </span>
                  </div>
                  <TaskCardIndicators task={task} className="mt-1" />
                  {task.description ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {renderContentWithMentions(
                        getDescriptionPreview(task.description, 90),
                        {
                          mentionUsers,
                        }
                      )}
                    </p>
                  ) : null}
                </button>
              ))}
            </div>
          </details>
        </div>
      ) : null}

      <Droppable droppableId={status} isDropDisabled={!canEdit}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            aria-labelledby={laneTitleId}
            data-kanban-lane-scroll={status}
            data-kanban-dropzone={status}
            role="region"
            tabIndex={0}
            className={cn(
              "min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-y-contain rounded-md px-6 pb-6 pt-2 [scrollbar-gutter:stable] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              SLIM_SCROLLBAR_CLASSES,
              snapshot.isDraggingOver && chrome.dragState
            )}
          >
            <div className="min-h-[180px] space-y-3 rounded-md p-2">
              {tasks.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/50 bg-background/70 px-4 py-8 text-center">
                  <p className="text-sm font-medium text-foreground/90">
                    {isFiltering
                      ? `No matching ${status.toLocaleLowerCase()} tasks`
                      : chrome.emptyCopy}
                  </p>
                </div>
              ) : null}

              {tasks.map((task, index) => (
                <Draggable
                  key={task.id}
                  draggableId={task.id}
                  index={index}
                  isDragDisabled={!canEdit}
                >
                  {(draggableProvided, draggableSnapshot) => {
                    const epicColor = task.epic
                      ? getEpicColorFromName(task.epic.name)
                      : null;

                    return (
                      <article
                        ref={draggableProvided.innerRef}
                        {...draggableProvided.draggableProps}
                        {...(canEdit
                          ? draggableProvided.dragHandleProps
                          : {
                              role: "button",
                              tabIndex: 0,
                              onKeyDown: (
                                event: ReactKeyboardEvent<HTMLElement>
                              ) => {
                                if (
                                  event.key === "Enter" ||
                                  event.key === " "
                                ) {
                                  event.preventDefault();
                                  onSelectTask(task);
                                }
                              },
                            })}
                        data-kanban-task-id={task.id}
                        data-kanban-task-card={task.id}
                        style={buildDragStyle(
                          draggableProvided.draggableProps.style,
                          draggableSnapshot.isDragging
                        )}
                        className={cn(
                          "rounded-xl border border-border/70 bg-card/95 p-3 shadow-sm transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          canEdit
                            ? "cursor-grab active:cursor-grabbing"
                            : "cursor-pointer",
                          draggableSnapshot.isDragging && "shadow-lg",
                          highlightedTaskIds.has(task.id) &&
                            "border-border/80 bg-muted/35 shadow-[0_0_0_1px_rgba(148,163,184,0.08)]"
                        )}
                        onClick={() => {
                          if (!draggableSnapshot.isDragging) {
                            onSelectTask(task);
                          }
                        }}
                        onMouseEnter={() => onTaskHoverChange(task.id)}
                        onMouseLeave={() => onTaskHoverChange(null)}
                        onDoubleClick={(event) => {
                          if (!canEdit) {
                            return;
                          }
                          event.stopPropagation();
                          onEditTask(task);
                        }}
                      >
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <h3 className="min-w-0 flex-1 text-sm font-medium leading-snug [overflow-wrap:anywhere] line-clamp-2">
                            {task.title}
                          </h3>
                          <div className="flex items-center gap-1">
                            {status === "Blocked" ? (
                              <span
                                className="rounded-sm p-1 text-amber-500"
                                aria-label="Blocked task"
                                title="Blocked task"
                              >
                                <TriangleAlert className="h-4 w-4" />
                              </span>
                            ) : null}
                            {canEdit ? (
                              <span
                                className="rounded-sm p-1 text-muted-foreground"
                                aria-label="Drag task"
                                title="Drag task"
                              >
                                <GripVertical className="h-4 w-4" />
                              </span>
                            ) : null}
                          </div>
                        </div>

                        <TaskCardIndicators
                          task={task}
                          className="-mt-1 mb-2"
                        />

                        {task.description ? (
                          <p className="break-words text-xs text-muted-foreground">
                            {renderContentWithMentions(
                              getDescriptionPreview(task.description),
                              {
                                mentionUsers,
                              }
                            )}
                          </p>
                        ) : null}

                        {task.epic && epicColor ? (
                          <div className="mt-3">
                            <span
                              className="inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-medium"
                              style={{
                                backgroundColor: epicColor.soft,
                                borderColor: epicColor.border,
                                color: epicColor.accent,
                              }}
                              title={task.epic.name}
                            >
                              <Flag className="h-3 w-3" />
                              <span className="truncate">{task.epic.name}</span>
                            </span>
                          </div>
                        ) : null}

                        {task.assignee ? (
                          <div
                            className={cn(
                              "mt-3 flex items-center gap-2 rounded-full border px-2 py-1 text-xs",
                              task.assignee.isAssignable
                                ? "border-border/60 bg-background/70 text-muted-foreground"
                                : "border-amber-500/45 bg-amber-500/[0.08] text-amber-700 dark:text-amber-300"
                            )}
                            title={
                              task.assignee.usernameTag ?? task.assignee.displayName
                            }
                          >
                            {task.assignee.kind === "agent" ? (
                              <AgentAvatar
                                displayName={task.assignee.displayName}
                                className="h-5 w-5"
                                decorative
                              />
                            ) : task.assignee.avatarSeed ? (
                              <UserAvatar
                                avatarSeed={task.assignee.avatarSeed}
                                displayName={task.assignee.displayName}
                                className="h-5 w-5 border-border/70"
                                decorative
                              />
                            ) : (
                              <span
                                aria-hidden
                                className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-border/60 bg-primary/10 text-[10px] font-semibold text-primary"
                              >
                                {task.assignee.displayName.trim().charAt(0).toUpperCase() || "?"}
                              </span>
                            )}
                            <span className="truncate">
                              {task.assignee.displayName}
                            </span>
                            {task.assignee.kind === "agent" ? (
                              <span className="shrink-0 text-[10px] text-muted-foreground">
                                agent
                              </span>
                            ) : null}
                            {!task.assignee.isAssignable ? (
                              <TriangleAlert
                                aria-label="Needs reassignment"
                                className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-300"
                              />
                            ) : null}
                          </div>
                        ) : null}

                        {task.labels.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-1">
                            {task.labels.map((label) => (
                              <span
                                key={label}
                                className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium text-slate-900"
                                style={{
                                  backgroundColor: getTaskLabelColor(label),
                                }}
                              >
                                {label}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </article>
                    );
                  }}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          </div>
        )}
      </Droppable>
    </Card>
  );
}

function TaskCardIndicators({
  task,
  className,
}: {
  task: KanbanTask;
  className?: string;
}) {
  const hasRelatedTasks = task.relatedTasks.length > 0;
  const hasAttachments = task.attachments.length > 0;
  const hasComments = task.commentCount > 0;
  const deadlineUrgency = getTaskDeadlineUrgency({
    deadlineDate: task.deadlineDate,
    status: task.status,
    archivedAt: task.archivedAt,
  });
  const hasDeadline = Boolean(task.deadlineDate);

  if (!hasRelatedTasks && !hasAttachments && !hasDeadline && !hasComments) {
    return null;
  }

  return (
    <div
      className={cn("flex items-center gap-1 text-muted-foreground", className)}
    >
      {hasDeadline ? (
        <TaskDeadlineIndicator
          deadlineDate={task.deadlineDate}
          urgency={deadlineUrgency}
        />
      ) : null}
      {hasRelatedTasks ? (
        <span
          className="rounded-sm p-1"
          aria-label="Task has related tasks"
          title="Task has related tasks"
        >
          <Link2 className="h-3.5 w-3.5" />
        </span>
      ) : null}
      {hasComments ? (
        <span
          className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/70 px-2 py-0.5 text-[11px] font-medium"
          aria-label={`Task has ${task.commentCount} comment${task.commentCount === 1 ? "" : "s"}`}
          title={`${task.commentCount} comment${task.commentCount === 1 ? "" : "s"}`}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          <span>{task.commentCount}</span>
        </span>
      ) : null}
      {hasAttachments ? (
        <span
          className="rounded-sm p-1"
          aria-label="Task has attachments"
          title="Task has attachments"
        >
          <Paperclip className="h-3.5 w-3.5" />
        </span>
      ) : null}
    </div>
  );
}

function getDeadlineIndicatorTone(urgency: TaskDeadlineUrgency): string {
  switch (urgency) {
    case "overdue":
      return "border-red-500/35 bg-red-500/10 text-red-700 dark:text-red-200";
    case "soon":
      return "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-200";
    default:
      return "border-border/60 bg-background/70 text-muted-foreground";
  }
}

function TaskDeadlineIndicator({
  deadlineDate,
  urgency,
}: {
  deadlineDate: string | null;
  urgency: TaskDeadlineUrgency;
}) {
  if (!deadlineDate) {
    return null;
  }

  const formattedDeadline = formatTaskDeadlineForDisplay(deadlineDate);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        getDeadlineIndicatorTone(urgency)
      )}
      title={`Deadline ${formattedDeadline}`}
      aria-label={`Deadline ${formattedDeadline}`}
    >
      <Clock3 className="h-3.5 w-3.5" />
      <span>{formattedDeadline}</span>
    </span>
  );
}
