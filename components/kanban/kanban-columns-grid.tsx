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

interface KanbanColumnsGridProps {
  columns: TaskColumns<KanbanTask>;
  archivedDoneTasks: KanbanTask[];
  onDragEnd: (result: DropResult) => void;
  onSelectTask: (task: KanbanTask) => void;
}

export function KanbanColumnsGrid({
  columns,
  archivedDoneTasks,
  onDragEnd,
  onSelectTask,
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
            onSelectTask={onSelectTask}
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
  onSelectTask: (task: KanbanTask) => void;
}

function KanbanColumn({
  status,
  tasks,
  archivedDoneTasks,
  onSelectTask,
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
                  className="w-full rounded-md border border-border/60 bg-card px-2 py-2 text-left transition hover:bg-muted/40"
                  onClick={() => onSelectTask(task)}
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
                        draggableSnapshot.isDragging && "shadow-lg"
                      )}
                      onClick={() => {
                        if (!draggableSnapshot.isDragging) {
                          onSelectTask(task);
                        }
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
                          <span className="rounded-sm p-1 text-muted-foreground">
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
