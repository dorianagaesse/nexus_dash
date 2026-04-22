import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd";
import { Archive, Clock3, Flag, GripVertical, Link2, MessageSquare, Paperclip, TriangleAlert } from "lucide-react";

import type { KanbanTask } from "@/components/kanban-board-types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserAvatar } from "@/components/ui/user-avatar";
import { getEpicColorFromName } from "@/lib/epic";
import {
  buildDragStyle,
  getDescriptionPreview,
  type TaskColumns,
} from "@/components/kanban-board-utils";
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
    badge: string;
    column: string;
    dragState: string;
    emptyCopy: string;
  }
> = {
  Backlog: {
    accent: "bg-slate-400/80 dark:bg-slate-300/70",
    badge:
      "border-slate-300/70 bg-slate-100/80 text-slate-700 dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-200",
    column:
      "border-slate-200/70 bg-gradient-to-b from-slate-100/30 via-card to-card dark:border-slate-800/80 dark:from-slate-900/35",
    dragState: "bg-slate-100/50 dark:bg-slate-900/35",
    emptyCopy: "No tasks queued yet",
  },
  "In Progress": {
    accent: "bg-sky-500/80 dark:bg-sky-400/80",
    badge:
      "border-sky-200/80 bg-sky-100/80 text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/55 dark:text-sky-200",
    column:
      "border-sky-200/70 bg-gradient-to-b from-sky-100/35 via-card to-card dark:border-sky-950/80 dark:from-sky-950/30",
    dragState: "bg-sky-100/45 dark:bg-sky-950/30",
    emptyCopy: "No active work in flight",
  },
  Blocked: {
    accent: "bg-amber-500/85 dark:bg-amber-400/85",
    badge:
      "border-amber-200/80 bg-amber-100/80 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/55 dark:text-amber-200",
    column:
      "border-amber-200/70 bg-gradient-to-b from-amber-100/35 via-card to-card dark:border-amber-950/80 dark:from-amber-950/30",
    dragState: "bg-amber-100/45 dark:bg-amber-950/30",
    emptyCopy: "Nothing blocked right now",
  },
  Done: {
    accent: "bg-emerald-500/80 dark:bg-emerald-400/80",
    badge:
      "border-emerald-200/80 bg-emerald-100/80 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/55 dark:text-emerald-200",
    column:
      "border-emerald-200/70 bg-gradient-to-b from-emerald-100/35 via-card to-card dark:border-emerald-950/80 dark:from-emerald-950/28",
    dragState: "bg-emerald-100/45 dark:bg-emerald-950/28",
    emptyCopy: "Nothing finished yet",
  },
};

interface KanbanColumnsGridProps {
  canEdit: boolean;
  columns: TaskColumns<KanbanTask>;
  archivedDoneTasks: KanbanTask[];
  highlightedTaskIds: Set<string>;
  onDragEnd: (result: DropResult) => void;
  onSelectTask: (task: KanbanTask) => void;
  onEditTask: (task: KanbanTask) => void;
  onTaskHoverChange: (taskId: string | null) => void;
}

export function KanbanColumnsGrid({
  canEdit,
  columns,
  archivedDoneTasks,
  highlightedTaskIds,
  onDragEnd,
  onSelectTask,
  onEditTask,
  onTaskHoverChange,
}: KanbanColumnsGridProps) {
  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="grid gap-4 xl:grid-cols-4">
        {TASK_STATUSES.map((status) => (
          <KanbanColumn
            canEdit={canEdit}
            key={status}
            status={status}
            tasks={columns[status]}
            archivedDoneTasks={status === "Done" ? archivedDoneTasks : []}
            highlightedTaskIds={highlightedTaskIds}
            onSelectTask={onSelectTask}
            onEditTask={onEditTask}
            onTaskHoverChange={onTaskHoverChange}
          />
        ))}
      </div>
    </DragDropContext>
  );
}

interface KanbanColumnProps {
  canEdit: boolean;
  status: TaskStatus;
  tasks: KanbanTask[];
  archivedDoneTasks: KanbanTask[];
  highlightedTaskIds: Set<string>;
  onSelectTask: (task: KanbanTask) => void;
  onEditTask: (task: KanbanTask) => void;
  onTaskHoverChange: (taskId: string | null) => void;
}

function KanbanColumn({
  canEdit,
  status,
  tasks,
  archivedDoneTasks,
  highlightedTaskIds,
  onSelectTask,
  onEditTask,
  onTaskHoverChange,
}: KanbanColumnProps) {
  const chrome = COLUMN_CHROME[status];

  return (
    <Card className={cn("min-h-[320px] overflow-hidden border shadow-[0_18px_48px_-42px_rgba(15,23,42,0.7)]", chrome.column)}>
      <div className={cn("h-1.5 w-full", chrome.accent)} />
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span>{status}</span>
          <Badge variant="outline" className={chrome.badge}>
            {tasks.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {status === "Done" && archivedDoneTasks.length > 0 ? (
          <details className="mb-3 rounded-xl border border-border/60 bg-background/55">
            <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground">
              Archive ({archivedDoneTasks.length})
            </summary>
            <div className="space-y-2 border-t border-border/60 p-2">
              {archivedDoneTasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  className={cn(
                    "w-full rounded-md border border-border/60 bg-card px-2 py-2 text-left transition hover:bg-muted/40",
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
                      {getDescriptionPreview(task.description, 90)}
                    </p>
                  ) : null}
                </button>
              ))}
            </div>
          </details>
        ) : null}

        <Droppable droppableId={status} isDropDisabled={!canEdit}>
          {(provided, snapshot) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className={cn(
                "min-h-[180px] space-y-3 rounded-md p-2",
                snapshot.isDraggingOver && chrome.dragState
              )}
            >
                {tasks.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border/50 bg-background/70 px-4 py-8 text-center">
                    <p className="text-sm font-medium text-foreground/90">{chrome.emptyCopy}</p>
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
                        {...(canEdit ? draggableProvided.dragHandleProps : {})}
                        style={buildDragStyle(
                          draggableProvided.draggableProps.style,
                          draggableSnapshot.isDragging
                        )}
                        className={cn(
                          "rounded-xl border border-border/70 bg-card/95 p-3 shadow-sm transition duration-150",
                          canEdit ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
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
                          <h3 className="text-sm font-medium leading-snug">{task.title}</h3>
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

                        <TaskCardIndicators task={task} className="-mt-1 mb-2" />

                        {task.description ? (
                          <p className="break-words text-xs text-muted-foreground">
                            {getDescriptionPreview(task.description)}
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
                          <div className="mt-3 flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-2 py-1 text-xs text-muted-foreground">
                            <UserAvatar
                              avatarSeed={task.assignee.avatarSeed}
                              displayName={task.assignee.displayName}
                              className="h-5 w-5 border-border/70"
                              decorative
                            />
                            <span className="truncate">{task.assignee.displayName}</span>
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
          )}
        </Droppable>
      </CardContent>
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
    <div className={cn("flex items-center gap-1 text-muted-foreground", className)}>
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
