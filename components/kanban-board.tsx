"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
  type DraggableProvidedDraggableProps,
} from "@hello-pangea/dnd";
import { GripVertical } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  isTaskStatus,
  TASK_STATUSES,
  type TaskStatus,
} from "@/lib/task-status";

export interface KanbanTask {
  id: string;
  title: string;
  description: string | null;
  label: string | null;
  status: TaskStatus;
}

type TaskColumns = Record<TaskStatus, KanbanTask[]>;

interface KanbanBoardProps {
  projectId: string;
  initialTasks: KanbanTask[];
}

function createEmptyColumns(): TaskColumns {
  return {
    Backlog: [],
    "In Progress": [],
    Blocked: [],
    Done: [],
  };
}

function mapTasksToColumns(tasks: KanbanTask[]): TaskColumns {
  const columns = createEmptyColumns();

  tasks.forEach((task) => {
    columns[task.status].push(task);
  });

  return columns;
}

function cloneColumns(columns: TaskColumns): TaskColumns {
  return {
    Backlog: [...columns.Backlog],
    "In Progress": [...columns["In Progress"]],
    Blocked: [...columns.Blocked],
    Done: [...columns.Done],
  };
}

function buildDragStyle(
  style: DraggableProvidedDraggableProps["style"],
  isDragging: boolean
): DraggableProvidedDraggableProps["style"] {
  if (!isDragging || !style) {
    return style;
  }

  const transform = style.transform;

  if (!transform) {
    return style;
  }

  return {
    ...style,
    transform: `${transform} rotate(1deg) scale(1.01)`,
  };
}

function buildPersistPayload(columns: TaskColumns) {
  return {
    columns: TASK_STATUSES.map((status) => ({
      status,
      taskIds: columns[status].map((task) => task.id),
    })),
  };
}

export function KanbanBoard({ projectId, initialTasks }: KanbanBoardProps) {
  const initialColumns = useMemo(() => mapTasksToColumns(initialTasks), [initialTasks]);
  const [columns, setColumns] = useState<TaskColumns>(initialColumns);
  const [isSaving, startTransition] = useTransition();
  const [persistError, setPersistError] = useState<string | null>(null);

  useEffect(() => {
    setColumns(initialColumns);
  }, [initialColumns]);

  const persistColumns = useCallback(
    async (nextColumns: TaskColumns, previousColumns: TaskColumns) => {
      try {
        const response = await fetch(`/api/projects/${projectId}/tasks/reorder`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(buildPersistPayload(nextColumns)),
        });

        if (!response.ok) {
          throw new Error("Persist request failed");
        }

        setPersistError(null);
      } catch (error) {
        console.error("[KanbanBoard.persistColumns]", error);
        setColumns(previousColumns);
        setPersistError("Could not save task movement. Board reverted.");
      }
    },
    [projectId]
  );

  const onDragEnd = useCallback(
    (result: DropResult) => {
      const { source, destination } = result;

      if (!destination) {
        return;
      }

      if (
        source.droppableId === destination.droppableId &&
        source.index === destination.index
      ) {
        return;
      }

      const sourceStatus = source.droppableId;
      const destinationStatus = destination.droppableId;

      if (!isTaskStatus(sourceStatus) || !isTaskStatus(destinationStatus)) {
        setPersistError("Invalid drag target. Please retry.");
        return;
      }

      const previousColumns = cloneColumns(columns);
      const nextColumns = cloneColumns(columns);

      const [movedTask] = nextColumns[sourceStatus].splice(source.index, 1);

      if (!movedTask) {
        return;
      }

      nextColumns[destinationStatus].splice(destination.index, 0, {
        ...movedTask,
        status: destinationStatus,
      });

      setColumns(nextColumns);
      setPersistError(null);

      startTransition(() => {
        void persistColumns(nextColumns, previousColumns);
      });
    },
    [columns, persistColumns]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Kanban board</h2>
        <span className="text-xs text-muted-foreground">
          {isSaving ? "Saving movement..." : "Drag cards to update status"}
        </span>
      </div>

      {persistError ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive-foreground">
          {persistError}
        </div>
      ) : null}

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="grid gap-4 xl:grid-cols-4">
          {TASK_STATUSES.map((status) => (
            <Card key={status} className="min-h-[300px]">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-base">
                  <span>{status}</span>
                  <Badge variant="outline">{columns[status].length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Droppable droppableId={status}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={cn(
                        "min-h-[180px] space-y-3 rounded-md border border-dashed border-border/60 p-2",
                        snapshot.isDraggingOver && "bg-muted/40"
                      )}
                    >
                      {columns[status].length === 0 ? (
                        <div className="rounded-md border border-border/50 bg-background/70 px-3 py-6 text-center text-sm text-muted-foreground">
                          Drop tasks here
                        </div>
                      ) : null}

                      {columns[status].map((task, index) => (
                        <Draggable key={task.id} draggableId={task.id} index={index}>
                          {(draggableProvided, draggableSnapshot) => (
                            <article
                              ref={draggableProvided.innerRef}
                              {...draggableProvided.draggableProps}
                              style={buildDragStyle(
                                draggableProvided.draggableProps.style,
                                draggableSnapshot.isDragging
                              )}
                              className={cn(
                                "rounded-md border border-border/70 bg-card p-3 shadow-sm transition",
                                draggableSnapshot.isDragging && "shadow-lg"
                              )}
                            >
                              <div className="mb-2 flex items-start justify-between gap-2">
                                <h3 className="text-sm font-medium leading-snug">
                                  {task.title}
                                </h3>
                                <button
                                  type="button"
                                  aria-label={`Drag ${task.title}`}
                                  className="rounded-sm p-1 text-muted-foreground hover:bg-muted"
                                  {...draggableProvided.dragHandleProps}
                                >
                                  <GripVertical className="h-4 w-4" />
                                </button>
                              </div>

                              {task.description ? (
                                <p className="text-xs text-muted-foreground">
                                  {task.description}
                                </p>
                              ) : null}

                              {task.label ? (
                                <div className="mt-3">
                                  <Badge variant="secondary">{task.label}</Badge>
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
          ))}
        </div>
      </DragDropContext>
    </div>
  );
}
