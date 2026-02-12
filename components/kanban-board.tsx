"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
  type DraggableProvidedDraggableProps,
} from "@hello-pangea/dnd";
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  Link2,
  Paperclip,
  Pencil,
  Trash2,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";

import { RichTextEditor } from "@/components/rich-text-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { richTextToPlainText } from "@/lib/rich-text";
import {
  ATTACHMENT_KIND_FILE,
  ATTACHMENT_KIND_LINK,
  formatAttachmentFileSize,
} from "@/lib/task-attachment";
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
  blockedNote: string | null;
  label: string | null;
  status: TaskStatus;
  attachments: TaskAttachment[];
}

export interface TaskAttachment {
  id: string;
  kind: string;
  name: string;
  url: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  downloadUrl: string | null;
}

type TaskColumns = Record<TaskStatus, KanbanTask[]>;

interface KanbanBoardProps {
  projectId: string;
  initialTasks: KanbanTask[];
  archivedDoneTasks?: KanbanTask[];
  headerAction?: ReactNode;
}

function getDescriptionPreview(description: string, maxLength = 140): string {
  const plainText = richTextToPlainText(description);

  if (plainText.length <= maxLength) {
    return plainText;
  }

  return `${plainText.slice(0, maxLength - 3)}...`;
}

function resolveAttachmentHref(attachment: TaskAttachment): string | null {
  if (attachment.kind === ATTACHMENT_KIND_FILE) {
    return attachment.downloadUrl;
  }

  if (attachment.kind === ATTACHMENT_KIND_LINK) {
    return attachment.url;
  }

  return null;
}

async function readApiError(response: Response, fallbackMessage: string): Promise<string> {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  return payload?.error ?? fallbackMessage;
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

export function KanbanBoard({
  projectId,
  initialTasks,
  archivedDoneTasks: initialArchivedDoneTasks = [],
  headerAction,
}: KanbanBoardProps) {
  const initialColumns = useMemo(() => mapTasksToColumns(initialTasks), [initialTasks]);
  const [columns, setColumns] = useState<TaskColumns>(initialColumns);
  const [archivedDoneTasks, setArchivedDoneTasks] = useState<KanbanTask[]>(
    initialArchivedDoneTasks
  );
  const [isSaving, startTransition] = useTransition();
  const [persistError, setPersistError] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<KanbanTask | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);

  const [isEditMode, setIsEditMode] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editBlockedNote, setEditBlockedNote] = useState("");
  const [isUpdatingTask, setIsUpdatingTask] = useState(false);
  const [taskModalError, setTaskModalError] = useState<string | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [isSubmittingAttachment, setIsSubmittingAttachment] = useState(false);
  const [linkName, setLinkName] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [fileLabel, setFileLabel] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);

  useEffect(() => {
    setColumns(initialColumns);
  }, [initialColumns]);

  useEffect(() => {
    setArchivedDoneTasks(initialArchivedDoneTasks);
  }, [initialArchivedDoneTasks]);

  useEffect(() => {
    try {
      const storageKey = `nexusdash:project:${projectId}:kanban-expanded`;
      const storedValue = window.localStorage.getItem(storageKey);

      if (storedValue === "1" || storedValue === "0") {
        setIsExpanded(storedValue === "1");
      }
    } catch (error) {
      console.error("[KanbanBoard.loadExpandedState]", error);
    }
  }, [projectId]);

  useEffect(() => {
    try {
      const storageKey = `nexusdash:project:${projectId}:kanban-expanded`;
      window.localStorage.setItem(storageKey, isExpanded ? "1" : "0");
    } catch (error) {
      console.error("[KanbanBoard.persistExpandedState]", error);
    }
  }, [isExpanded, projectId]);

  useEffect(() => {
    if (!selectedTask) {
      return;
    }

    setIsEditMode(false);
    setTaskModalError(null);
    setEditTitle(selectedTask.title);
    setEditLabel(selectedTask.label ?? "");
    setEditDescription(selectedTask.description ?? "");
    setEditBlockedNote(selectedTask.blockedNote ?? "");
    setAttachmentError(null);
    setLinkName("");
    setLinkUrl("");
    setFileLabel("");
    setSelectedFile(null);
    setFileInputKey((previous) => previous + 1);
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
    setAttachmentError(null);
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
            blockedNote: editBlockedNote,
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
          blockedNote: string | null;
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
        blockedNote: payload.task.blockedNote,
        status: payload.task.status,
        attachments: selectedTask.attachments,
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

      setArchivedDoneTasks((previousArchivedTasks) => {
        const taskIndex = previousArchivedTasks.findIndex(
          (task) => task.id === updatedTask.id
        );

        if (taskIndex === -1) {
          return previousArchivedTasks;
        }

        if (updatedTask.status !== "Done") {
          return previousArchivedTasks.filter((task) => task.id !== updatedTask.id);
        }

        const nextArchivedTasks = [...previousArchivedTasks];
        nextArchivedTasks[taskIndex] = {
          ...nextArchivedTasks[taskIndex],
          ...updatedTask,
        };
        return nextArchivedTasks;
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
  }, [editBlockedNote, editDescription, editLabel, editTitle, projectId, selectedTask]);

  const applyTaskMutation = useCallback(
    (taskId: string, mutateTask: (task: KanbanTask) => KanbanTask) => {
      setColumns((previousColumns) => {
        let hasChanges = false;
        const nextColumns = createEmptyColumns();

        TASK_STATUSES.forEach((status) => {
          nextColumns[status] = previousColumns[status].map((task) => {
            if (task.id !== taskId) {
              return task;
            }

            hasChanges = true;
            return mutateTask(task);
          });
        });

        return hasChanges ? nextColumns : previousColumns;
      });

      setArchivedDoneTasks((previousTasks) => {
        let hasChanges = false;
        const nextTasks = previousTasks.map((task) => {
          if (task.id !== taskId) {
            return task;
          }

          hasChanges = true;
          return mutateTask(task);
        });

        return hasChanges ? nextTasks : previousTasks;
      });

      setSelectedTask((previousTask) => {
        if (!previousTask || previousTask.id !== taskId) {
          return previousTask;
        }
        return mutateTask(previousTask);
      });
    },
    []
  );

  const handleAddLinkAttachment = useCallback(async () => {
    if (!selectedTask) {
      return;
    }

    setIsSubmittingAttachment(true);
    setAttachmentError(null);

    try {
      const formData = new FormData();
      formData.append("kind", ATTACHMENT_KIND_LINK);
      formData.append("name", linkName.trim());
      formData.append("url", linkUrl.trim());

      const response = await fetch(
        `/api/projects/${projectId}/tasks/${selectedTask.id}/attachments`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (!response.ok) {
        throw new Error(await readApiError(response, "Could not add link attachment."));
      }

      const payload = (await response.json()) as { attachment: TaskAttachment };
      applyTaskMutation(selectedTask.id, (task) => ({
        ...task,
        attachments: [payload.attachment, ...task.attachments],
      }));
      setLinkName("");
      setLinkUrl("");
    } catch (error) {
      console.error("[KanbanBoard.handleAddLinkAttachment]", error);
      setAttachmentError(
        error instanceof Error ? error.message : "Could not add link attachment."
      );
    } finally {
      setIsSubmittingAttachment(false);
    }
  }, [applyTaskMutation, linkName, linkUrl, projectId, selectedTask]);

  const handleAddFileAttachment = useCallback(async () => {
    if (!selectedTask || !selectedFile) {
      return;
    }

    setIsSubmittingAttachment(true);
    setAttachmentError(null);

    try {
      const formData = new FormData();
      formData.append("kind", ATTACHMENT_KIND_FILE);
      formData.append("name", fileLabel.trim());
      formData.append("file", selectedFile);

      const response = await fetch(
        `/api/projects/${projectId}/tasks/${selectedTask.id}/attachments`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (!response.ok) {
        throw new Error(await readApiError(response, "Could not upload file attachment."));
      }

      const payload = (await response.json()) as { attachment: TaskAttachment };
      applyTaskMutation(selectedTask.id, (task) => ({
        ...task,
        attachments: [payload.attachment, ...task.attachments],
      }));
      setFileLabel("");
      setSelectedFile(null);
      setFileInputKey((previous) => previous + 1);
    } catch (error) {
      console.error("[KanbanBoard.handleAddFileAttachment]", error);
      setAttachmentError(
        error instanceof Error ? error.message : "Could not upload file attachment."
      );
    } finally {
      setIsSubmittingAttachment(false);
    }
  }, [applyTaskMutation, fileLabel, projectId, selectedFile, selectedTask]);

  const handleDeleteAttachment = useCallback(
    async (attachmentId: string) => {
      if (!selectedTask) {
        return;
      }

      setIsSubmittingAttachment(true);
      setAttachmentError(null);

      try {
        const response = await fetch(
          `/api/projects/${projectId}/tasks/${selectedTask.id}/attachments/${attachmentId}`,
          {
            method: "DELETE",
          }
        );

        if (!response.ok) {
          throw new Error(await readApiError(response, "Could not delete attachment."));
        }

        applyTaskMutation(selectedTask.id, (task) => ({
          ...task,
          attachments: task.attachments.filter(
            (attachment) => attachment.id !== attachmentId
          ),
        }));
      } catch (error) {
        console.error("[KanbanBoard.handleDeleteAttachment]", error);
        setAttachmentError(
          error instanceof Error ? error.message : "Could not delete attachment."
        );
      } finally {
        setIsSubmittingAttachment(false);
      }
    },
    [applyTaskMutation, projectId, selectedTask]
  );

  const totalTaskCount = useMemo(
    () =>
      TASK_STATUSES.reduce((count, status) => count + columns[status].length, 0) +
      archivedDoneTasks.length,
    [archivedDoneTasks.length, columns]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => setIsExpanded((previous) => !previous)}
          aria-expanded={isExpanded}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left transition hover:bg-muted/40"
        >
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
          <h2 className="text-lg font-semibold tracking-tight">Kanban board</h2>
          {!isExpanded ? (
            <span className="ml-auto text-xs text-muted-foreground">
              {totalTaskCount} task{totalTaskCount === 1 ? "" : "s"}
            </span>
          ) : null}
        </button>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {isExpanded ? (
            <span className="text-xs text-muted-foreground">
              {isSaving ? "Saving movement..." : "Drag cards to update status"}
            </span>
          ) : null}
          {headerAction ? <div>{headerAction}</div> : null}
        </div>
      </div>

      {isExpanded && persistError ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive-foreground">
          {persistError}
        </div>
      ) : null}

      {isExpanded ? (
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
                            onClick={() => setSelectedTask(task)}
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
      ) : null}

      {selectedTask ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeTaskModal();
            }
          }}
        >
          <Card
            className="w-full max-w-xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
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
              <div className="flex items-center gap-1">
                {!isEditMode ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsEditMode(true)}
                    aria-label="Edit task"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={closeTaskModal}
                  aria-label="Close task"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {!isEditMode ? (
                <>
                  {selectedTask.label ? (
                    <Badge variant="secondary">{selectedTask.label}</Badge>
                  ) : null}
                  {selectedTask.status === "Blocked" ? (
                    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-200">
                      <div className="mb-1 flex items-center gap-2 font-medium">
                        <TriangleAlert className="h-4 w-4" />
                        Blocked follow-up
                      </div>
                      <p className="whitespace-pre-wrap break-words">
                        {selectedTask.blockedNote?.trim().length
                          ? selectedTask.blockedNote
                          : "No follow-up added yet."}
                      </p>
                    </div>
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
                  <div className="grid gap-2 rounded-md border border-border/60 bg-muted/20 p-3">
                    <p className="text-sm font-medium">Attachments</p>
                    {selectedTask.attachments.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No attachments yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {selectedTask.attachments.map((attachment) => {
                          const href = resolveAttachmentHref(attachment);

                          return (
                            <div
                              key={attachment.id}
                              className="flex items-center gap-2 rounded-md border border-border/60 bg-background px-2 py-1.5"
                            >
                              <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                              <div className="min-w-0">
                                {href ? (
                                  <a
                                    href={href}
                                    target={
                                      attachment.kind === ATTACHMENT_KIND_LINK
                                        ? "_blank"
                                        : undefined
                                    }
                                    rel={
                                      attachment.kind === ATTACHMENT_KIND_LINK
                                        ? "noreferrer"
                                        : undefined
                                    }
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

                  {selectedTask.status === "Blocked" ? (
                    <div className="grid gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2">
                      <label className="text-sm font-medium text-amber-700 dark:text-amber-200">
                        Blocked follow-up
                      </label>
                      <textarea
                        value={editBlockedNote}
                        onChange={(event) => setEditBlockedNote(event.target.value)}
                        rows={3}
                        maxLength={1200}
                        placeholder="Add blocker context and next action..."
                        className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                      />
                    </div>
                  ) : null}

                  <div className="grid gap-3 rounded-md border border-border/60 bg-muted/20 p-3">
                    <p className="text-sm font-medium">Attachments</p>

                    {selectedTask.attachments.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No attachments yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {selectedTask.attachments.map((attachment) => {
                          const href = resolveAttachmentHref(attachment);

                          return (
                            <div
                              key={attachment.id}
                              className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background px-2 py-1.5"
                            >
                              <div className="min-w-0">
                                {href ? (
                                  <a
                                    href={href}
                                    target={
                                      attachment.kind === ATTACHMENT_KIND_LINK
                                        ? "_blank"
                                        : undefined
                                    }
                                    rel={
                                      attachment.kind === ATTACHMENT_KIND_LINK
                                        ? "noreferrer"
                                        : undefined
                                    }
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
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => void handleDeleteAttachment(attachment.id)}
                                disabled={isSubmittingAttachment}
                                aria-label="Delete attachment"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="grid gap-2 rounded-md border border-border/60 bg-background p-2">
                      <label className="text-xs font-medium">Add link</label>
                      <input
                        value={linkName}
                        onChange={(event) => setLinkName(event.target.value)}
                        maxLength={120}
                        placeholder="Optional label"
                        className="h-9 rounded-md border border-input bg-background px-3 text-xs"
                      />
                      <input
                        value={linkUrl}
                        onChange={(event) => setLinkUrl(event.target.value)}
                        placeholder="https://..."
                        className="h-9 rounded-md border border-input bg-background px-3 text-xs"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => void handleAddLinkAttachment()}
                        disabled={isSubmittingAttachment || !linkUrl.trim()}
                      >
                        <Link2 className="h-4 w-4" />
                        Add link
                      </Button>
                    </div>

                    <div className="grid gap-2 rounded-md border border-border/60 bg-background p-2">
                      <label className="text-xs font-medium">Upload file</label>
                      <input
                        value={fileLabel}
                        onChange={(event) => setFileLabel(event.target.value)}
                        maxLength={120}
                        placeholder="Optional label"
                        className="h-9 rounded-md border border-input bg-background px-3 text-xs"
                      />
                      <input
                        key={fileInputKey}
                        type="file"
                        onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                        className="text-xs"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => void handleAddFileAttachment()}
                        disabled={isSubmittingAttachment || !selectedFile}
                      >
                        <Upload className="h-4 w-4" />
                        Upload file
                      </Button>
                    </div>

                    {attachmentError ? (
                      <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive-foreground">
                        {attachmentError}
                      </div>
                    ) : null}
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
