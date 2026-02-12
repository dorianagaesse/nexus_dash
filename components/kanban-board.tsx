"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
  type DraggableProvidedDraggableProps,
} from "@hello-pangea/dnd";
import { GripVertical, Pencil, X } from "lucide-react";

import { RichTextEditor } from "@/components/rich-text-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { richTextToPlainText } from "@/lib/rich-text";
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

function getDescriptionPreview(description: string, maxLength = 140): string {
  const plainText = richTextToPlainText(description);

  if (plainText.length <= maxLength) {
    return plainText;
  }

  return `${plainText.slice(0, maxLength - 3)}...`;
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
  const [selectedTask, setSelectedTask] = useState<KanbanTask | null>(null);

  const [isEditMode, setIsEditMode] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [isUpdatingTask, setIsUpdatingTask] = useState(false);
  const [taskModalError, setTaskModalError] = useState<string | null>(null);

  useEffect(() => {
    setColumns(initialColumns);
  }, [initialColumns]);

  useEffect(() => {
    if (!selectedTask) {
      return;
    }

    setIsEditMode(false);
    setTaskModalError(null);
    setEditTitle(selectedTask.title);
    setEditLabel(selectedTask.label ?? "");
    setEditDescription(selectedTask.description ?? "");
  }, [selectedTask]);

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

  const closeTaskModal = useCallback(() => {
    setSelectedTask(null);
    setIsEditMode(false);
    setTaskModalError(null);
  }, []);

  const handleTaskUpdate = useCallback(async () => {
    if (!selectedTask) {
      return;
    }

    const normalizedTitle = editTitle.trim();
    const normalizedLabel = editLabel.trim();

    if (normalizedTitle.length < 2) {
      setTaskModalError("Task title must be at least 2 characters.");
      return;
    }

    setIsUpdatingTask(true);

    try {
      const response = await fetch(
        `/api/projects/${projectId}/tasks/${selectedTask.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: normalizedTitle,
            label: normalizedLabel,
            description: editDescription,
          }),
        }
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error ?? "Failed to update task");
      }

      const payload = (await response.json()) as {
        task: {
          id: string;
          title: string;
          label: string | null;
          description: string | null;
          status: string;
        };
      };

      if (!isTaskStatus(payload.task.status)) {
        throw new Error("Invalid task status returned by server");
      }

      const updatedTask: KanbanTask = {
        id: payload.task.id,
        title: payload.task.title,
        label: payload.task.label,
        description: payload.task.description,
        status: payload.task.status,
      };

      setColumns((previousColumns) => {
        const nextColumns = cloneColumns(previousColumns);
        const taskColumn = nextColumns[updatedTask.status];
        const taskIndex = taskColumn.findIndex((task) => task.id === updatedTask.id);

        if (taskIndex === -1) {
          return previousColumns;
        }

        taskColumn[taskIndex] = {
          ...taskColumn[taskIndex],
          ...updatedTask,
        };

        return nextColumns;
      });

      setSelectedTask(updatedTask);
      setTaskModalError(null);
      setIsEditMode(false);
    } catch (error) {
      console.error("[KanbanBoard.handleTaskUpdate]", error);
      setTaskModalError("Could not save task changes.");
    } finally {
      setIsUpdatingTask(false);
    }
  }, [editDescription, editLabel, editTitle, projectId, selectedTask]);

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
                                  setSelectedTask(task);
                                }
                              }}
                            >
                              <div className="mb-2 flex items-start justify-between gap-2">
                                <h3 className="text-sm font-medium leading-snug">
                                  {task.title}
                                </h3>
                                <span className="rounded-sm p-1 text-muted-foreground">
                                  <GripVertical className="h-4 w-4" />
                                </span>
                              </div>

                              {task.description ? (
                                <p className="text-xs text-muted-foreground break-words">
                                  {getDescriptionPreview(task.description)}
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

      {selectedTask ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <Card className="w-full max-w-xl">
            <CardHeader className="flex flex-row items-start justify-between space-y-0">
              <div className="space-y-2">
                <Badge variant="outline">{selectedTask.status}</Badge>
                {!isEditMode ? (
                  <CardTitle className="text-xl">{selectedTask.title}</CardTitle>
                ) : (
                  <input
                    value={editTitle}
                    onChange={(event) => setEditTitle(event.target.value)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  />
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={closeTaskModal}
              >
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {!isEditMode ? (
                <>
                  {selectedTask.label ? (
                    <Badge variant="secondary">{selectedTask.label}</Badge>
                  ) : null}
                  <div className="max-h-[52vh] overflow-y-auto text-sm text-muted-foreground [overflow-wrap:anywhere] [&_*]:max-w-full [&_*]:break-words [&_h1]:mb-3 [&_h1]:text-xl [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5 [&_p]:mb-2">
                    <div
                      dangerouslySetInnerHTML={{
                        __html:
                          selectedTask.description ??
                          "<p>No description provided.</p>",
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="secondary" onClick={() => setIsEditMode(true)}>
                      <Pencil className="h-4 w-4" />
                      Edit task
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">Label</label>
                    <input
                      value={editLabel}
                      onChange={(event) => setEditLabel(event.target.value)}
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    />
                  </div>

                  <div className="grid gap-2">
                    <label className="text-sm font-medium">Description</label>
                    <RichTextEditor
                      id={`task-description-editor-${selectedTask.id}`}
                      value={editDescription}
                      onChange={setEditDescription}
                      placeholder="Task details..."
                    />
                  </div>

                  {taskModalError ? (
                    <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive-foreground">
                      {taskModalError}
                    </div>
                  ) : null}

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      onClick={() => void handleTaskUpdate()}
                      disabled={isUpdatingTask}
                    >
                      {isUpdatingTask ? "Saving..." : "Save changes"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setIsEditMode(false)}
                      disabled={isUpdatingTask}
                    >
                      Cancel
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
