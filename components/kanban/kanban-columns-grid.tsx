import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd";
import { Archive, GripVertical, Link2, Paperclip, TriangleAlert } from "lucide-react";

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

interface KanbanColumnsGridProps {
  columns: TaskColumns<KanbanTask>;
  archivedDoneTasks: KanbanTask[];
  highlightedTaskIds: Set<string>;
  hoveredTaskId: string | null;
  onDragEnd: (result: DropResult) => void;
  onSelectTask: (task: KanbanTask) => void;
  onEditTask: (task: KanbanTask) => void;
  onTaskHoverChange: (taskId: string | null) => void;
}

export function KanbanColumnsGrid({
  columns,
  archivedDoneTasks,
  highlightedTaskIds,
  hoveredTaskId,
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
            hoveredTaskId={hoveredTaskId}
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
  hoveredTaskId: string | null;
  onSelectTask: (task: KanbanTask) => void;
  onEditTask: (task: KanbanTask) => void;
  onTaskHoverChange: (taskId: string | null) => void;
}

function KanbanColumn({
  status,
  tasks,
  archivedDoneTasks,
  highlightedTaskIds,
  hoveredTaskId,
  onSelectTask,
  onEditTask,
  onTaskHoverChange,
}: KanbanColumnProps) {
  return (
    <Card className="min-h-[300px]">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span>{status}</span>
          <Badge variant="outline">{tasks.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {status === "Done" && archivedDoneTasks.length > 0 ? (
          <details className="mb-3 rounded-md border border-border/60 bg-muted/20">
            <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground">
              Archive ({archivedDoneTasks.length})
            </summary>
            <div className="space-y-2 border-t border-border/60 p-2">
              {archivedDoneTasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  className={cn(
                    "w-full rounded-md border border-dashed border-border/45 bg-muted/15 px-2.5 py-2.5 text-left transition hover:bg-muted/25",
                    hoveredTaskId === task.id &&
                      "border-border/80 bg-muted/30 shadow-sm",
                    highlightedTaskIds.has(task.id) &&
                      hoveredTaskId !== task.id &&
                      "border-border/60 bg-muted/22"
                  )}
                  onClick={() => onSelectTask(task)}
                  onMouseEnter={() => onTaskHoverChange(task.id)}
                  onMouseLeave={() => onTaskHoverChange(null)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-foreground/90">
                      <Archive className="h-3.5 w-3.5 shrink-0 text-emerald-400/80" />
                      <span className="truncate">{task.title}</span>
                    </p>
                    <div className="flex items-center gap-1.5">
                      <TaskCardIndicators task={task} />
                      <span className="rounded-full border border-emerald-500/20 bg-emerald-500/5 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.18em] text-emerald-300/80">
                        Archived
                      </span>
                    </div>
                  </div>
                  {task.description ? (
                    <p className="mt-1 text-xs text-muted-foreground/85">
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
                snapshot.isDraggingOver && "bg-muted/40"
              )}
            >
              {tasks.length === 0 ? (
                <div className="rounded-md border border-border/50 bg-background/70 px-3 py-6 text-center text-sm text-muted-foreground">
                  Drop tasks here
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
                        "cursor-grab rounded-md border border-border/70 bg-card p-3 shadow-sm transition active:cursor-grabbing",
                        draggableSnapshot.isDragging && "shadow-lg",
                        hoveredTaskId === task.id &&
                          "border-border bg-muted/35 shadow-md",
                        highlightedTaskIds.has(task.id) &&
                          hoveredTaskId !== task.id &&
                          "border-border/80 bg-muted/20 shadow-sm"
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
                          <TaskCardIndicators task={task} />
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

function TaskCardIndicators({ task }: { task: KanbanTask }) {
  const hasRelatedTasks = task.relatedTasks.length > 0;
  const hasAttachments = task.attachments.length > 0;

  if (!hasRelatedTasks && !hasAttachments) {
    return null;
  }

  return (
    <div className="flex items-center gap-1 text-muted-foreground">
      {hasRelatedTasks ? (
        <span
          className="rounded-sm p-1"
          aria-label="Task has related tasks"
          title="Task has related tasks"
        >
          <Link2 className="h-3.5 w-3.5" />
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
