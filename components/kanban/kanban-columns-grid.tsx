import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd";
import { GripVertical, TriangleAlert } from "lucide-react";

import type { KanbanTask } from "@/components/kanban-board-types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildDragStyle,
  getDescriptionPreview,
  type TaskColumns,
} from "@/components/kanban-board-utils";
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
  columns: TaskColumns<KanbanTask>;
  archivedDoneTasks: KanbanTask[];
  highlightedTaskIds: Set<string>;
  onDragEnd: (result: DropResult) => void;
  onSelectTask: (task: KanbanTask) => void;
  onEditTask: (task: KanbanTask) => void;
  onTaskHoverChange: (taskId: string | null) => void;
}

export function KanbanColumnsGrid({
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
  status: TaskStatus;
  tasks: KanbanTask[];
  archivedDoneTasks: KanbanTask[];
  highlightedTaskIds: Set<string>;
  onSelectTask: (task: KanbanTask) => void;
  onEditTask: (task: KanbanTask) => void;
  onTaskHoverChange: (taskId: string | null) => void;
}

function KanbanColumn({
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
                      "border-emerald-500/60 bg-emerald-500/10 shadow-[0_0_0_1px_rgba(16,185,129,0.15)]"
                  )}
                  onClick={() => onSelectTask(task)}
                  onMouseEnter={() => onTaskHoverChange(task.id)}
                  onMouseLeave={() => onTaskHoverChange(null)}
                >
                  <p className="text-xs font-medium text-foreground">{task.title}</p>
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

        <Droppable droppableId={status}>
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
                  <p className="mt-2 text-xs text-muted-foreground">
                    Drag a card here when work belongs in this lane.
                  </p>
                </div>
              ) : null}

              {tasks.map((task, index) => (
                <Draggable key={task.id} draggableId={task.id} index={index}>
                  {(draggableProvided, draggableSnapshot) => (
                    <article
                      ref={draggableProvided.innerRef}
                      {...draggableProvided.draggableProps}
                      {...draggableProvided.dragHandleProps}
                      style={buildDragStyle(
                        draggableProvided.draggableProps.style,
                        draggableSnapshot.isDragging
                      )}
                      className={cn(
                        "cursor-grab rounded-xl border border-border/70 bg-card/95 p-3 shadow-sm transition duration-150 active:cursor-grabbing",
                        draggableSnapshot.isDragging && "shadow-lg",
                        highlightedTaskIds.has(task.id) &&
                          "border-emerald-500/60 bg-emerald-500/10 shadow-[0_0_0_1px_rgba(16,185,129,0.15)]"
                      )}
                      onClick={() => {
                        if (!draggableSnapshot.isDragging) {
                          onSelectTask(task);
                        }
                      }}
                      onMouseEnter={() => onTaskHoverChange(task.id)}
                      onMouseLeave={() => onTaskHoverChange(null)}
                      onDoubleClick={(event) => {
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
                          <span
                            className="rounded-sm p-1 text-muted-foreground"
                            aria-label="Drag task"
                            title="Drag task"
                          >
                            <GripVertical className="h-4 w-4" />
                          </span>
                        </div>
                      </div>

                      {task.description ? (
                        <p className="break-words text-xs text-muted-foreground">
                          {getDescriptionPreview(task.description)}
                        </p>
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
                  )}
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
