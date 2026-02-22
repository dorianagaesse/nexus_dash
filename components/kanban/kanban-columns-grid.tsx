import { useEffect, useRef, useState } from "react";
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd";
import {
  ChevronRight,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Trash2,
  TriangleAlert,
} from "lucide-react";

import type { KanbanTask } from "@/components/kanban-board-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  selectedTaskId: string | null;
  onDragEnd: (result: DropResult) => void;
  onSelectTask: (task: KanbanTask) => void;
  onEditTask: (task: KanbanTask) => void;
  onRequestDeleteTask: (task: KanbanTask) => void;
  onMoveTask: (task: KanbanTask, nextStatus: TaskStatus) => void;
}

export function KanbanColumnsGrid({
  columns,
  archivedDoneTasks,
  selectedTaskId,
  onDragEnd,
  onSelectTask,
  onEditTask,
  onRequestDeleteTask,
  onMoveTask,
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
            selectedTaskId={selectedTaskId}
            onSelectTask={onSelectTask}
            onEditTask={onEditTask}
            onRequestDeleteTask={onRequestDeleteTask}
            onMoveTask={onMoveTask}
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
  selectedTaskId: string | null;
  onSelectTask: (task: KanbanTask) => void;
  onEditTask: (task: KanbanTask) => void;
  onRequestDeleteTask: (task: KanbanTask) => void;
  onMoveTask: (task: KanbanTask, nextStatus: TaskStatus) => void;
}

function KanbanColumn({
  status,
  tasks,
  archivedDoneTasks,
  selectedTaskId,
  onSelectTask,
  onEditTask,
  onRequestDeleteTask,
  onMoveTask,
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
                      style={buildDragStyle(
                        draggableProvided.draggableProps.style,
                        draggableSnapshot.isDragging
                      )}
                      className={cn(
                        "cursor-grab rounded-md border border-border/70 bg-card p-3 shadow-sm transition active:cursor-grabbing",
                        selectedTaskId === task.id && "ring-1 ring-slate-900/20",
                        draggableSnapshot.isDragging && "shadow-lg"
                      )}
                      onClick={() => {
                        if (!draggableSnapshot.isDragging) {
                          onSelectTask(task);
                        }
                      }}
                      onDoubleClick={(event) => {
                        event.stopPropagation();
                        onEditTask(task);
                      }}
                    >
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <h3 className="text-sm font-medium leading-snug">{task.title}</h3>
                        <div className="flex items-center gap-1">
                          {selectedTaskId === task.id ? (
                            <TaskOptionsMenu
                              task={task}
                              status={status}
                              onEditTask={onEditTask}
                              onRequestDeleteTask={onRequestDeleteTask}
                              onMoveTask={onMoveTask}
                            />
                          ) : null}
                          {status === "Blocked" ? (
                            <span
                              className="rounded-sm p-1 text-amber-500"
                              aria-label="Blocked task"
                              title="Blocked task"
                            >
                              <TriangleAlert className="h-4 w-4" />
                            </span>
                          ) : null}
                          <button
                            type="button"
                            className="rounded-sm p-1 text-muted-foreground"
                            aria-label="Drag task"
                            onClick={(event) => event.stopPropagation()}
                            {...draggableProvided.dragHandleProps}
                          >
                            <GripVertical className="h-4 w-4" />
                          </button>
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

interface TaskOptionsMenuProps {
  task: KanbanTask;
  status: TaskStatus;
  onEditTask: (task: KanbanTask) => void;
  onRequestDeleteTask: (task: KanbanTask) => void;
  onMoveTask: (task: KanbanTask, nextStatus: TaskStatus) => void;
}

function TaskOptionsMenu({
  task,
  status,
  onEditTask,
  onRequestDeleteTask,
  onMoveTask,
}: TaskOptionsMenuProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && menuRef.current && !menuRef.current.contains(target)) {
        setIsMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isMenuOpen]);

  return (
    <div
      ref={menuRef}
      className="relative"
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="list-none rounded-sm p-1 text-muted-foreground hover:bg-muted [&::-webkit-details-marker]:hidden"
        aria-label="Task options"
        aria-expanded={isMenuOpen}
        onClick={() => setIsMenuOpen((previous) => !previous)}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {isMenuOpen ? (
        <div className="absolute right-0 z-20 mt-1 w-40 rounded-md border border-border/70 bg-background p-1 shadow-md">
          <Button
            type="button"
            variant="ghost"
            className="w-full justify-start"
            onClick={() => {
              setIsMenuOpen(false);
              onEditTask(task);
            }}
          >
            <Pencil className="h-4 w-4" />
            Edit
          </Button>

          <div className="group relative">
            <div className="rounded-sm p-2 text-sm text-foreground hover:bg-muted">
              <span className="inline-flex w-full items-center justify-between gap-2">
                Move to
                <ChevronRight className="h-4 w-4" />
              </span>
            </div>
            <div className="invisible pointer-events-none absolute left-full top-0 z-30 ml-1 w-36 rounded-md border border-border/70 bg-background p-1 opacity-0 shadow-md transition group-hover:visible group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:visible group-focus-within:pointer-events-auto group-focus-within:opacity-100">
              {TASK_STATUSES.map((nextStatus) => (
                <Button
                  key={nextStatus}
                  type="button"
                  variant="ghost"
                  className="w-full justify-start"
                  disabled={nextStatus === status}
                  onClick={() => {
                    onMoveTask(task, nextStatus);
                    setIsMenuOpen(false);
                  }}
                >
                  {nextStatus}
                </Button>
              ))}
            </div>
          </div>

          <Button
            type="button"
            variant="ghost"
            className="w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => {
              setIsMenuOpen(false);
              onRequestDeleteTask(task);
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
