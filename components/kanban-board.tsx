"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import type { DropResult } from "@hello-pangea/dnd";

import {
  type KanbanTask,
  type PendingAttachmentUpload,
  type TaskAttachment,
} from "@/components/kanban-board-types";
import { KanbanBoardHeader } from "@/components/kanban/kanban-board-header";
import { KanbanColumnsGrid } from "@/components/kanban/kanban-columns-grid";
import { TaskDetailModal } from "@/components/kanban/task-detail-modal";
import { useToast } from "@/components/toast-provider";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  buildPersistPayload,
  cloneColumns,
  createEmptyColumns,
  mapTasksToColumns,
  readApiError,
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
} from "@/lib/task-attachment";
import { uploadFileAttachmentDirect } from "@/lib/direct-upload-client";
import {
  MAX_TASK_LABELS,
  getTaskLabelsFromStorage,
  normalizeTaskLabel,
} from "@/lib/task-label";
import { isTaskStatus, TASK_STATUSES, type TaskStatus } from "@/lib/task-status";

export type { KanbanTask } from "@/components/kanban-board-types";

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
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [pendingDeleteTask, setPendingDeleteTask] = useState<KanbanTask | null>(null);
  const [isDeletingTask, setIsDeletingTask] = useState(false);
  const shouldOpenTaskInEditModeRef = useRef(false);
  const { pushToast } = useToast();
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
  const hasPendingAttachmentUploads = pendingAttachmentUploads.length > 0;

  useEffect(() => {
    setColumns(initialColumns);
  }, [initialColumns]);

  useEffect(() => {
    setArchivedDoneTasks(initialArchivedDoneTasks);
  }, [initialArchivedDoneTasks]);

  useEffect(() => {
    if (!activeTaskId) {
      return;
    }

    const stillExists = TASK_STATUSES.some((status) =>
      columns[status].some((task) => task.id === activeTaskId)
    );

    if (!stillExists) {
      setActiveTaskId(null);
    }
  }, [activeTaskId, columns]);

  useEffect(() => {
    if (!selectedTask) {
      return;
    }

    setIsEditMode(shouldOpenTaskInEditModeRef.current);
    shouldOpenTaskInEditModeRef.current = false;
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
    shouldOpenTaskInEditModeRef.current = false;
    setIsEditMode(false);
    setTaskModalError(null);
    setAttachmentError(null);
    setPreviewAttachment(null);
  }, []);

  const handleSelectTask = useCallback((task: KanbanTask) => {
    shouldOpenTaskInEditModeRef.current = false;
    setActiveTaskId(task.id);
    setSelectedTask(task);
  }, []);

  const openTaskInEditMode = useCallback((task: KanbanTask) => {
    shouldOpenTaskInEditModeRef.current = true;
    setActiveTaskId(task.id);
    setSelectedTask(task);
  }, []);

  const handleActivateTaskEditMode = useCallback(() => {
    setIsEditMode(true);
    setTaskModalError(null);
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
            blockedFollowUps: {
              id: string;
              content: string;
              createdAt: string;
            }[];
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
    if (!selectedTask) {
      return;
    }

    if (editTitle.trim().length < 2) {
      setTaskModalError("Task title must be at least 2 characters.");
      return;
    }

    setTaskModalError(null);
    setIsEditMode(false);

    const didSave = await persistTaskChanges({ exitEditMode: false });
    if (didSave) {
      pushToast({
        variant: "success",
        message: "Task saved.",
      });
      return;
    }

    pushToast({
      variant: "error",
      message: "Could not save task changes. Please retry.",
    });
    setIsEditMode(true);
  }, [editTitle, persistTaskChanges, pushToast, selectedTask]);

  const handleMoveTaskToStatus = useCallback(
    (task: KanbanTask, nextStatus: TaskStatus) => {
      if (task.status === nextStatus) {
        return;
      }

      const previousColumns = cloneColumns(columns);
      const nextColumns = cloneColumns(columns);
      const sourceTasks = nextColumns[task.status];
      const sourceIndex = sourceTasks.findIndex((entry) => entry.id === task.id);

      if (sourceIndex === -1) {
        return;
      }

      const [movedTask] = sourceTasks.splice(sourceIndex, 1);
      if (!movedTask) {
        return;
      }

      nextColumns[nextStatus].unshift({
        ...movedTask,
        status: nextStatus,
      });

      setColumns(nextColumns);
      setSelectedTask((previousTask) => {
        if (!previousTask || previousTask.id !== task.id) {
          return previousTask;
        }
        return {
          ...previousTask,
          status: nextStatus,
        };
      });
      setPersistError(null);

      startTransition(() => {
        void persistColumns(nextColumns, previousColumns);
      });

      pushToast({
        variant: "success",
        message: `Task moved to ${nextStatus}.`,
      });
    },
    [columns, persistColumns, pushToast]
  );

  const confirmDeleteTask = useCallback(async () => {
    if (!pendingDeleteTask || isDeletingTask) {
      return;
    }

    setIsDeletingTask(true);

    try {
      const response = await fetch(
        `/api/projects/${projectId}/tasks/${pendingDeleteTask.id}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        throw new Error(await readApiError(response, "Could not delete task."));
      }

      setColumns((previousColumns) => {
        const nextColumns = createEmptyColumns<KanbanTask>();
        TASK_STATUSES.forEach((status) => {
          nextColumns[status] = previousColumns[status].filter(
            (task) => task.id !== pendingDeleteTask.id
          );
        });
        return nextColumns;
      });
      setArchivedDoneTasks((previousTasks) =>
        previousTasks.filter((task) => task.id !== pendingDeleteTask.id)
      );
      setSelectedTask((previousTask) => {
        if (!previousTask || previousTask.id !== pendingDeleteTask.id) {
          return previousTask;
        }
        return null;
      });
      setActiveTaskId((previousTaskId) =>
        previousTaskId === pendingDeleteTask.id ? null : previousTaskId
      );

      pushToast({
        variant: "success",
        message: "Task deleted.",
      });
    } catch (error) {
      console.error("[KanbanBoard.confirmDeleteTask]", error);
      pushToast({
        variant: "error",
        message: error instanceof Error ? error.message : "Could not delete task.",
      });
    } finally {
      setPendingDeleteTask(null);
      setIsDeletingTask(false);
    }
  }, [isDeletingTask, pendingDeleteTask, projectId, pushToast]);

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
      pushToast({
        variant: "success",
        message: "Attachment link added.",
      });
    } catch (error) {
      console.error("[KanbanBoard.handleAddLinkAttachment]", error);
      const message =
        error instanceof Error ? error.message : "Could not add link attachment.";
      setAttachmentError(message);
      pushToast({
        variant: "error",
        message,
      });
    } finally {
      setIsSubmittingAttachment(false);
    }
  }, [applyTaskMutation, linkUrl, projectId, pushToast, selectedTask]);

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
        pushToast({
          variant: "success",
          message: "Attachment uploaded.",
        });
      } catch (error) {
        console.error("[KanbanBoard.handleAddFileAttachment]", error);
        const message =
          error instanceof Error
            ? error.message
            : "Could not upload file attachment.";
        setAttachmentError(message);
        pushToast({
          variant: "error",
          message,
        });
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
      pushToast,
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
        pushToast({
          variant: "success",
          message: "Attachment deleted.",
        });
      } catch (error) {
        console.error("[KanbanBoard.handleDeleteAttachment]", error);
        const message =
          error instanceof Error ? error.message : "Could not delete attachment.";
        setAttachmentError(message);
        pushToast({
          variant: "error",
          message,
        });
      } finally {
        setIsSubmittingAttachment(false);
      }
    },
    [applyTaskMutation, projectId, pushToast, selectedTask]
  );

  const totalTaskCount = useMemo(
    () =>
      TASK_STATUSES.reduce((count, status) => count + columns[status].length, 0) +
      archivedDoneTasks.length,
    [archivedDoneTasks.length, columns]
  );

  return (
    <div className="space-y-4">
      <KanbanBoardHeader
        isExpanded={isExpanded}
        totalTaskCount={totalTaskCount}
        isSaving={isSaving}
        headerAction={headerAction}
        onToggleExpanded={() => setIsExpanded((previous) => !previous)}
      />

      {isExpanded && persistError ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {persistError}
        </div>
      ) : null}

      {isExpanded ? (
        <KanbanColumnsGrid
          columns={columns}
          archivedDoneTasks={archivedDoneTasks}
          selectedTaskId={activeTaskId}
          onDragEnd={onDragEnd}
          onSelectTask={handleSelectTask}
          onEditTask={openTaskInEditMode}
          onRequestDeleteTask={setPendingDeleteTask}
          onMoveTask={handleMoveTaskToStatus}
        />
      ) : null}

      <TaskDetailModal
        isOpen={isClient && Boolean(selectedTask)}
        selectedTask={selectedTask}
        isEditMode={isEditMode}
        editTitle={editTitle}
        editLabels={editLabels}
        editLabelInput={editLabelInput}
        editLabelSuggestions={editLabelSuggestions}
        editDescription={editDescription}
        newBlockedFollowUpEntry={newBlockedFollowUpEntry}
        isUpdatingTask={isUpdatingTask}
        taskModalError={taskModalError}
        attachmentError={attachmentError}
        isSubmittingAttachment={isSubmittingAttachment}
        hasPendingAttachmentUploads={hasPendingAttachmentUploads}
        pendingAttachmentUploads={pendingAttachmentUploads}
        isLinkComposerOpen={isLinkComposerOpen}
        linkUrl={linkUrl}
        fileInputKey={fileInputKey}
        previewAttachment={previewAttachment}
        onClose={closeTaskModal}
        onActivateEditMode={handleActivateTaskEditMode}
        onToggleEditMode={setIsEditMode}
        onEditTitleChange={setEditTitle}
        onEditLabelInputChange={setEditLabelInput}
        onAddEditLabel={addEditLabel}
        onRemoveEditLabel={removeEditLabel}
        onEditDescriptionChange={setEditDescription}
        onNewBlockedFollowUpEntryChange={setNewBlockedFollowUpEntry}
        onAddBlockedFollowUpEntry={handleAddBlockedFollowUpEntry}
        onSaveTask={handleTaskUpdate}
        onToggleLinkComposer={() =>
          setIsLinkComposerOpen((previous) => !previous)
        }
        onLinkUrlChange={setLinkUrl}
        onAddLinkAttachment={handleAddLinkAttachment}
        onAddFileAttachment={handleAddFileAttachment}
        onDeleteAttachment={handleDeleteAttachment}
        onPreviewAttachmentChange={setPreviewAttachment}
      />

      <ConfirmDialog
        isOpen={Boolean(pendingDeleteTask)}
        title="Delete task?"
        description={
          pendingDeleteTask
            ? `This will permanently delete "${pendingDeleteTask.title}" and all of its attachments.`
            : "This will permanently delete this task and all of its attachments."
        }
        confirmLabel="Delete task"
        isConfirming={isDeletingTask}
        onConfirm={confirmDeleteTask}
        onCancel={() => setPendingDeleteTask(null)}
      />
    </div>
  );
}
