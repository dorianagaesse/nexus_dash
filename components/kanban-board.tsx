"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd";
import {
  ChevronDown,
  ChevronUp,
  Columns3,
  GripVertical,
  Link2,
  Paperclip,
  Pencil,
  Trash2,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";

import { AttachmentPreviewModal } from "@/components/attachment-preview-modal";
import { RichTextEditor } from "@/components/rich-text-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildDragStyle,
  buildPersistPayload,
  cloneColumns,
  createEmptyColumns,
  formatFollowUpTimestamp,
  getDescriptionPreview,
  mapTasksToColumns,
  readApiError,
  resolveAttachmentHref,
  type TaskColumns,
} from "@/components/kanban-board-utils";
import { useProjectSectionExpanded } from "@/lib/hooks/use-project-section-expanded";
import {
  ATTACHMENT_KIND_FILE,
  ATTACHMENT_KIND_LINK,
  DIRECT_UPLOAD_MAX_ATTACHMENT_FILE_SIZE_BYTES,
  DIRECT_UPLOAD_MAX_ATTACHMENT_FILE_SIZE_LABEL,
  MAX_ATTACHMENT_FILE_SIZE_BYTES,
  MAX_ATTACHMENT_FILE_SIZE_LABEL,
  formatAttachmentFileSize,
  isAttachmentPreviewable,
} from "@/lib/task-attachment";
import { uploadFileAttachmentDirect } from "@/lib/direct-upload-client";
import {
  MAX_TASK_LABELS,
  getTaskLabelsFromStorage,
  getTaskLabelColor,
  normalizeTaskLabel,
} from "@/lib/task-label";
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
  labels: string[];
  blockedFollowUps: TaskBlockedFollowUp[];
  status: TaskStatus;
  attachments: TaskAttachment[];
}

export interface TaskBlockedFollowUp {
  id: string;
  content: string;
  createdAt: string;
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

interface PendingAttachmentUpload {
  id: string;
  name: string;
  sizeBytes: number;
}

interface KanbanBoardProps {
  projectId: string;
  storageProvider: "local" | "r2";
  initialTasks: KanbanTask[];
  archivedDoneTasks?: KanbanTask[];
  headerAction?: ReactNode;
}

function createLocalUploadId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function KanbanBoard({
  projectId,
  storageProvider,
  initialTasks,
  archivedDoneTasks: initialArchivedDoneTasks = [],
  headerAction,
}: KanbanBoardProps) {
  const initialColumns = useMemo(
    () => mapTasksToColumns(initialTasks),
    [initialTasks]
  );
  const [columns, setColumns] =
    useState<TaskColumns<KanbanTask>>(initialColumns);
  const [archivedDoneTasks, setArchivedDoneTasks] = useState<KanbanTask[]>(
    initialArchivedDoneTasks
  );
  const [isSaving, startTransition] = useTransition();
  const [persistError, setPersistError] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<KanbanTask | null>(null);
  const { isExpanded, setIsExpanded } = useProjectSectionExpanded({
    projectId,
    sectionKey: "kanban",
    defaultExpanded: true,
    logLabel: "KanbanBoard",
  });

  const [isEditMode, setIsEditMode] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editLabels, setEditLabels] = useState<string[]>([]);
  const [editLabelInput, setEditLabelInput] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [newBlockedFollowUpEntry, setNewBlockedFollowUpEntry] = useState("");
  const [isUpdatingTask, setIsUpdatingTask] = useState(false);
  const [taskModalError, setTaskModalError] = useState<string | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [isSubmittingAttachment, setIsSubmittingAttachment] = useState(false);
  const [pendingAttachmentUploads, setPendingAttachmentUploads] = useState<
    PendingAttachmentUpload[]
  >([]);
  const [isLinkComposerOpen, setIsLinkComposerOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [fileInputKey, setFileInputKey] = useState(0);
  const [isClient, setIsClient] = useState(false);
  const [previewAttachment, setPreviewAttachment] =
    useState<TaskAttachment | null>(null);
  const maxAttachmentFileSizeBytes =
    storageProvider === "r2"
      ? DIRECT_UPLOAD_MAX_ATTACHMENT_FILE_SIZE_BYTES
      : MAX_ATTACHMENT_FILE_SIZE_BYTES;
  const maxAttachmentFileSizeLabel =
    storageProvider === "r2"
      ? DIRECT_UPLOAD_MAX_ATTACHMENT_FILE_SIZE_LABEL
      : MAX_ATTACHMENT_FILE_SIZE_LABEL;
  const attachmentFileSizeErrorMessage = `Attachment files must be ${maxAttachmentFileSizeLabel} or smaller.`;

  useEffect(() => {
    setColumns(initialColumns);
  }, [initialColumns]);

  useEffect(() => {
    setArchivedDoneTasks(initialArchivedDoneTasks);
  }, [initialArchivedDoneTasks]);

  useEffect(() => {
    if (!selectedTask) {
      return;
    }

    setIsEditMode(false);
    setTaskModalError(null);
    setEditTitle(selectedTask.title);
    setEditLabels(selectedTask.labels);
    setEditLabelInput("");
    setEditDescription(selectedTask.description ?? "");
    setNewBlockedFollowUpEntry("");
    setAttachmentError(null);
    setPendingAttachmentUploads([]);
    setIsLinkComposerOpen(false);
    setLinkUrl("");
    setFileInputKey((previous) => previous + 1);
    setPreviewAttachment(null);
  }, [selectedTask]);

  useEffect(() => {
    if (!previewAttachment || !selectedTask) {
      return;
    }

    const stillExists = selectedTask.attachments.some(
      (attachment) => attachment.id === previewAttachment.id
    );

    if (!stillExists) {
      setPreviewAttachment(null);
    }
  }, [previewAttachment, selectedTask]);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const allKnownLabels = useMemo(() => {
    const labels = new Set<string>();

    TASK_STATUSES.forEach((status) => {
      columns[status].forEach((task) => {
        task.labels.forEach((label) => labels.add(label));
      });
    });

    archivedDoneTasks.forEach((task) => {
      task.labels.forEach((label) => labels.add(label));
    });

    return Array.from(labels);
  }, [archivedDoneTasks, columns]);

  const editLabelSuggestions = useMemo(() => {
    const query = editLabelInput.trim().toLowerCase();
    if (!query) {
      return [];
    }

    const selected = new Set(editLabels.map((label) => label.toLowerCase()));
    return allKnownLabels
      .filter((label) => label.toLowerCase().startsWith(query))
      .filter((label) => !selected.has(label.toLowerCase()))
      .slice(0, 6);
  }, [allKnownLabels, editLabelInput, editLabels]);

  const addEditLabel = useCallback(
    (value: string) => {
      const normalizedLabel = normalizeTaskLabel(value);
      if (!normalizedLabel) {
        return;
      }

      if (editLabels.length >= MAX_TASK_LABELS) {
        return;
      }

      if (
        editLabels.some(
          (existingLabel) =>
            existingLabel.toLowerCase() === normalizedLabel.toLowerCase()
        )
      ) {
        setEditLabelInput("");
        return;
      }

      setEditLabels((previous) => [...previous, normalizedLabel]);
      setEditLabelInput("");
    },
    [editLabels]
  );

  const removeEditLabel = useCallback((labelToRemove: string) => {
    setEditLabels((previous) =>
      previous.filter((label) => label !== labelToRemove)
    );
  }, []);

  const persistColumns = useCallback(
    async (
      nextColumns: TaskColumns<KanbanTask>,
      previousColumns: TaskColumns<KanbanTask>
    ) => {
      try {
        const response = await fetch(
          `/api/projects/${projectId}/tasks/reorder`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(buildPersistPayload(nextColumns)),
          }
        );

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
    setPreviewAttachment(null);
  }, []);

  const persistTaskChanges = useCallback(
    async (options?: { exitEditMode?: boolean }) => {
      if (!selectedTask) {
        return false;
      }

      const normalizedTitle = editTitle.trim();
      const normalizedBlockedEntry = newBlockedFollowUpEntry.trim();

      if (normalizedTitle.length < 2) {
        setTaskModalError("Task title must be at least 2 characters.");
        return false;
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
              labels: editLabels,
              description: editDescription,
              blockedFollowUpEntry: normalizedBlockedEntry,
            }),
          }
        );

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(payload?.error ?? "Failed to update task");
        }

        const payload = (await response.json()) as {
          task: {
            id: string;
            title: string;
            label: string | null;
            labelsJson: string | null;
            description: string | null;
            blockedNote: string | null;
            status: string;
            blockedFollowUps: TaskBlockedFollowUp[];
          };
        };

        if (!isTaskStatus(payload.task.status)) {
          throw new Error("Invalid task status returned by server");
        }

        const updatedTask: KanbanTask = {
          id: payload.task.id,
          title: payload.task.title,
          labels: getTaskLabelsFromStorage(
            payload.task.labelsJson,
            payload.task.label
          ),
          description: payload.task.description,
          blockedFollowUps: payload.task.blockedFollowUps.map((entry) => ({
            ...entry,
            createdAt: entry.createdAt,
          })),
          status: payload.task.status,
          attachments: selectedTask.attachments,
        };

        setColumns((previousColumns) => {
          const nextColumns = cloneColumns(previousColumns);
          const taskColumn = nextColumns[updatedTask.status];
          const taskIndex = taskColumn.findIndex(
            (task) => task.id === updatedTask.id
          );

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
            return previousArchivedTasks.filter(
              (task) => task.id !== updatedTask.id
            );
          }

          const nextArchivedTasks = [...previousArchivedTasks];
          nextArchivedTasks[taskIndex] = {
            ...nextArchivedTasks[taskIndex],
            ...updatedTask,
          };
          return nextArchivedTasks;
        });

        setSelectedTask((previousTask) => {
          if (!previousTask || previousTask.id !== updatedTask.id) {
            return previousTask;
          }
          return updatedTask;
        });
        setTaskModalError(null);
        if (options?.exitEditMode !== false) {
          setIsEditMode(false);
        }
        setNewBlockedFollowUpEntry("");
        return true;
      } catch (error) {
        console.error("[KanbanBoard.handleTaskUpdate]", error);
        setTaskModalError("Could not save task changes.");
        return false;
      } finally {
        setIsUpdatingTask(false);
      }
    },
    [
      editDescription,
      editLabels,
      editTitle,
      newBlockedFollowUpEntry,
      projectId,
      selectedTask,
    ]
  );

  const handleTaskUpdate = useCallback(async () => {
    await persistTaskChanges({ exitEditMode: true });
  }, [persistTaskChanges]);

  const handleAddBlockedFollowUpEntry = useCallback(async () => {
    if (!newBlockedFollowUpEntry.trim()) {
      return;
    }
    await persistTaskChanges({ exitEditMode: false });
  }, [newBlockedFollowUpEntry, persistTaskChanges]);

  const applyTaskMutation = useCallback(
    (taskId: string, mutateTask: (task: KanbanTask) => KanbanTask) => {
      setColumns((previousColumns) => {
        let hasChanges = false;
        const nextColumns = createEmptyColumns<KanbanTask>();

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
    if (!selectedTask || !linkUrl.trim()) {
      return;
    }

    setIsSubmittingAttachment(true);
    setAttachmentError(null);

    try {
      const formData = new FormData();
      formData.append("kind", ATTACHMENT_KIND_LINK);
      formData.append("name", "");
      formData.append("url", linkUrl.trim());

      const response = await fetch(
        `/api/projects/${projectId}/tasks/${selectedTask.id}/attachments`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (!response.ok) {
        throw new Error(
          await readApiError(response, "Could not add link attachment.")
        );
      }

      const payload = (await response.json()) as { attachment: TaskAttachment };
      applyTaskMutation(selectedTask.id, (task) => ({
        ...task,
        attachments: [payload.attachment, ...task.attachments],
      }));
      setLinkUrl("");
      setIsLinkComposerOpen(false);
    } catch (error) {
      console.error("[KanbanBoard.handleAddLinkAttachment]", error);
      setAttachmentError(
        error instanceof Error
          ? error.message
          : "Could not add link attachment."
      );
    } finally {
      setIsSubmittingAttachment(false);
    }
  }, [applyTaskMutation, linkUrl, projectId, selectedTask]);

  const handleAddFileAttachment = useCallback(
    async (selectedFile: File | null) => {
      if (!selectedTask || !selectedFile) {
        return;
      }

      if (selectedFile.size > maxAttachmentFileSizeBytes) {
        setAttachmentError(attachmentFileSizeErrorMessage);
        setFileInputKey((previous) => previous + 1);
        return;
      }

      setAttachmentError(null);
      const pendingUploadId = createLocalUploadId();
      const taskId = selectedTask.id;
      setPendingAttachmentUploads((previous) => [
        {
          id: pendingUploadId,
          name: selectedFile.name,
          sizeBytes: selectedFile.size,
        },
        ...previous,
      ]);
      setFileInputKey((previous) => previous + 1);

      try {
        let attachment: TaskAttachment;

        if (storageProvider === "r2") {
          attachment = await uploadFileAttachmentDirect<TaskAttachment>({
            file: selectedFile,
            uploadTargetUrl: `/api/projects/${projectId}/tasks/${taskId}/attachments/upload-url`,
            finalizeUrl: `/api/projects/${projectId}/tasks/${taskId}/attachments/direct`,
            cleanupUrl: `/api/projects/${projectId}/tasks/${taskId}/attachments/direct/cleanup`,
            fallbackErrorMessage: "Could not upload file attachment.",
          });
        } else {
          const formData = new FormData();
          formData.append("kind", ATTACHMENT_KIND_FILE);
          formData.append("name", "");
          formData.append("file", selectedFile);

          const response = await fetch(
            `/api/projects/${projectId}/tasks/${taskId}/attachments`,
            {
              method: "POST",
              body: formData,
            }
          );

          if (!response.ok) {
            throw new Error(
              await readApiError(response, "Could not upload file attachment.")
            );
          }

          const payload = (await response.json()) as {
            attachment: TaskAttachment;
          };
          attachment = payload.attachment;
        }

        applyTaskMutation(taskId, (task) => ({
          ...task,
          attachments: [attachment, ...task.attachments],
        }));
      } catch (error) {
        console.error("[KanbanBoard.handleAddFileAttachment]", error);
        setAttachmentError(
          error instanceof Error
            ? error.message
            : "Could not upload file attachment."
        );
      } finally {
        setPendingAttachmentUploads((previous) =>
          previous.filter((upload) => upload.id !== pendingUploadId)
        );
      }
    },
    [
      applyTaskMutation,
      attachmentFileSizeErrorMessage,
      maxAttachmentFileSizeBytes,
      projectId,
      selectedTask,
      storageProvider,
    ]
  );

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
          throw new Error(
            await readApiError(response, "Could not delete attachment.")
          );
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
          error instanceof Error
            ? error.message
            : "Could not delete attachment."
        );
      } finally {
        setIsSubmittingAttachment(false);
      }
    },
    [applyTaskMutation, projectId, selectedTask]
  );

  const totalTaskCount = useMemo(
    () =>
      TASK_STATUSES.reduce(
        (count, status) => count + columns[status].length,
        0
      ) + archivedDoneTasks.length,
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
          <h2 className="text-lg font-semibold tracking-tight">
            <span className="inline-flex items-center gap-2">
              <Columns3 className="h-4 w-4 text-muted-foreground" />
              Kanban board
            </span>
          </h2>
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
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
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
                            <p className="text-xs font-medium text-foreground">
                              {task.title}
                            </p>
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
                          <Draggable
                            key={task.id}
                            draggableId={task.id}
                            index={index}
                          >
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

                                {task.labels.length > 0 ? (
                                  <div className="mt-3 flex flex-wrap gap-1">
                                    {task.labels.map((label) => (
                                      <span
                                        key={label}
                                        className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium text-slate-900"
                                        style={{
                                          backgroundColor:
                                            getTaskLabelColor(label),
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
            ))}
          </div>
        </DragDropContext>
      ) : null}

      {isClient && selectedTask
        ? createPortal(
            <div
              className="fixed inset-0 z-[90] flex min-h-dvh w-screen items-start justify-center overflow-y-auto overscroll-y-contain bg-black/70 p-4 sm:items-center"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                  closeTaskModal();
                }
              }}
            >
              <Card
                className="max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <CardHeader className="flex flex-row items-start justify-between space-y-0">
                  <div className="space-y-2">
                    <Badge variant="outline">{selectedTask.status}</Badge>
                    {!isEditMode ? (
                      <CardTitle className="text-xl">
                        {selectedTask.title}
                      </CardTitle>
                    ) : (
                      <input
                        aria-label="Task title"
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
                      {selectedTask.status === "Blocked" ? (
                        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-200">
                          <div className="mb-1 flex items-center gap-2 font-medium">
                            <TriangleAlert className="h-4 w-4" />
                            Blocked follow-up
                          </div>
                          {selectedTask.blockedFollowUps.length === 0 ? (
                            <p className="whitespace-pre-wrap break-words">
                              No follow-up added yet.
                            </p>
                          ) : (
                            <div className="space-y-1.5">
                              {selectedTask.blockedFollowUps.map((entry) => (
                                <article
                                  key={entry.id}
                                  className="grid grid-cols-[90px_1fr] items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5"
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
                        {selectedTask.attachments.length === 0 &&
                        pendingAttachmentUploads.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            No attachments yet.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {selectedTask.attachments.map((attachment) => {
                              const href = resolveAttachmentHref(attachment);
                              const canPreview =
                                isAttachmentPreviewable(
                                  attachment.kind,
                                  attachment.mimeType
                                ) && Boolean(attachment.downloadUrl);

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
                                        onClick={() =>
                                          setPreviewAttachment(attachment)
                                        }
                                        className="truncate text-left text-xs font-medium text-foreground underline underline-offset-2"
                                      >
                                        {attachment.name}
                                      </button>
                                    ) : href ? (
                                      <a
                                        href={href}
                                        target={
                                          attachment.kind ===
                                          ATTACHMENT_KIND_LINK
                                            ? "_blank"
                                            : undefined
                                        }
                                        rel={
                                          attachment.kind ===
                                          ATTACHMENT_KIND_LINK
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
                                    {attachment.kind ===
                                    ATTACHMENT_KIND_FILE ? (
                                      <p className="text-[11px] text-muted-foreground">
                                        {formatAttachmentFileSize(
                                          attachment.sizeBytes
                                        )}
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
                        <label
                          htmlFor="task-edit-label-input"
                          className="text-sm font-medium"
                        >
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
                                  onClick={() => removeEditLabel(label)}
                                  aria-label={`Remove label ${label}`}
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </span>
                            ))}
                            <input
                              id="task-edit-label-input"
                              value={editLabelInput}
                              onChange={(event) =>
                                setEditLabelInput(event.target.value)
                              }
                              onKeyDown={(event) => {
                                if (
                                  event.key === "Enter" ||
                                  event.key === ","
                                ) {
                                  event.preventDefault();
                                  addEditLabel(editLabelInput);
                                }
                              }}
                              maxLength={60}
                              className="h-8 min-w-[160px] flex-1 bg-transparent px-1 text-sm outline-none"
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
                                onClick={() => addEditLabel(suggestion)}
                                className="rounded-full border border-border/70 bg-background px-2 py-1 text-xs text-foreground hover:bg-muted"
                              >
                                {suggestion}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>

                      <div className="grid gap-2">
                        <label className="text-sm font-medium">
                          Description
                        </label>
                        <RichTextEditor
                          id={`task-description-editor-${selectedTask.id}`}
                          value={editDescription}
                          onChange={setEditDescription}
                          placeholder="Task details..."
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
                                  className="grid grid-cols-[90px_1fr] items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5"
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

                          <div className="flex items-center gap-2">
                            <input
                              value={newBlockedFollowUpEntry}
                              onChange={(event) =>
                                setNewBlockedFollowUpEntry(event.target.value)
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  void handleAddBlockedFollowUpEntry();
                                }
                              }}
                              maxLength={1200}
                              placeholder="Add follow-up and press Enter"
                              className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                              disabled={isUpdatingTask}
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              onClick={() =>
                                void handleAddBlockedFollowUpEntry()
                              }
                              disabled={
                                isUpdatingTask ||
                                !newBlockedFollowUpEntry.trim()
                              }
                            >
                              Add
                            </Button>
                          </div>
                        </div>
                      ) : null}

                      <div className="space-y-2">
                        {selectedTask.attachments.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            No attachments yet.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {selectedTask.attachments.map((attachment) => {
                              const href = resolveAttachmentHref(attachment);
                              const canPreview =
                                isAttachmentPreviewable(
                                  attachment.kind,
                                  attachment.mimeType
                                ) && Boolean(attachment.downloadUrl);

                              return (
                                <div
                                  key={attachment.id}
                                  className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background px-2 py-1.5"
                                >
                                  <div className="min-w-0">
                                    {canPreview ? (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setPreviewAttachment(attachment)
                                        }
                                        className="truncate text-left text-xs font-medium text-foreground underline underline-offset-2"
                                      >
                                        {attachment.name}
                                      </button>
                                    ) : href ? (
                                      <a
                                        href={href}
                                        target={
                                          attachment.kind ===
                                          ATTACHMENT_KIND_LINK
                                            ? "_blank"
                                            : undefined
                                        }
                                        rel={
                                          attachment.kind ===
                                          ATTACHMENT_KIND_LINK
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
                                    {attachment.kind ===
                                    ATTACHMENT_KIND_FILE ? (
                                      <p className="text-[11px] text-muted-foreground">
                                        {formatAttachmentFileSize(
                                          attachment.sizeBytes
                                        )}
                                      </p>
                                    ) : null}
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      onClick={() =>
                                        void handleDeleteAttachment(
                                          attachment.id
                                        )
                                      }
                                      disabled={isSubmittingAttachment}
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
                                  <p className="truncate text-xs font-medium text-foreground">
                                    {upload.name}
                                  </p>
                                  <p className="text-[11px] text-muted-foreground">
                                    Uploading...{" "}
                                    {formatAttachmentFileSize(upload.sizeBytes)}
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
                            onClick={() =>
                              setIsLinkComposerOpen((previous) => !previous)
                            }
                            disabled={isSubmittingAttachment}
                            aria-label="Add attachment link"
                          >
                            <Link2 className="h-4 w-4" />
                          </Button>
                          <input
                            key={fileInputKey}
                            id="task-edit-attachment-file"
                            type="file"
                            onChange={(event) =>
                              void handleAddFileAttachment(
                                event.target.files?.[0] ?? null
                              )
                            }
                            className="hidden"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            asChild
                          >
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
                          <div className="flex items-center gap-2 rounded-md border border-border/60 bg-background p-2">
                            <input
                              value={linkUrl}
                              onChange={(event) =>
                                setLinkUrl(event.target.value)
                              }
                              placeholder="https://..."
                              className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-xs"
                            />
                            <Button
                              type="button"
                              size="icon"
                              variant="secondary"
                              onClick={() => void handleAddLinkAttachment()}
                              disabled={
                                isSubmittingAttachment || !linkUrl.trim()
                              }
                              aria-label="Confirm attachment link"
                            >
                              <Link2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : null}

                        {attachmentError ? (
                          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                            {attachmentError}
                          </div>
                        ) : null}
                      </div>

                      {taskModalError ? (
                        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
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
            </div>,
            document.body
          )
        : null}
      <AttachmentPreviewModal
        attachment={previewAttachment}
        onClose={() => setPreviewAttachment(null)}
      />
    </div>
  );
}
