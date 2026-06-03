"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import type { DropResult } from "@hello-pangea/dnd";

import type { RelatedTaskOption } from "@/components/kanban/related-task-field";
import {
  type KanbanTask,
  type ProjectEpicOption,
  type ProjectTaskCollaborator,
  type TaskComment,
  type TaskCommentMentionSelection,
  type PendingAttachmentUpload,
  type TaskPersonSummary,
  type TaskAttachment,
  type TaskRelatedSummary,
  type TaskMutationResponseTask,
  type TaskCreateOptimisticDraft,
} from "@/components/kanban-board-types";
import { CreateTaskDialog } from "@/components/create-task-dialog";
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
  PROJECT_ACTIVITY_REMOTE_EVENT,
  fetchProjectActivityMutation,
  type ProjectActivityRemoteEventDetail,
} from "@/lib/project-activity-client";
import type { ProjectActivityEventPayload } from "@/lib/project-activity-event-types";
import {
  getTaskDeadlineUrgency,
} from "@/lib/task-deadline";
import {
  MAX_TASK_LABELS,
  getTaskLabelsFromStorage,
  normalizeTaskLabel,
} from "@/lib/task-label";
import { createRelatedTaskMap } from "@/lib/task-related";
import { isTaskStatus, TASK_STATUSES, type TaskStatus } from "@/lib/task-status";

export type { KanbanTask } from "@/components/kanban-board-types";

interface KanbanBoardProps {
  canEdit: boolean;
  projectId: string;
  actorUserId: string;
  storageProvider: "local" | "r2";
  initialTasks: KanbanTask[];
  archivedDoneTasks?: KanbanTask[];
  epics: ProjectEpicOption[];
  collaborators: ProjectTaskCollaborator[];
  initialTaskId?: string | null;
}

function createLocalUploadId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function stampTaskActivity(
  task: KanbanTask,
  actor: TaskPersonSummary | null
): KanbanTask {
  if (!actor) {
    return task;
  }

  return {
    ...task,
    updatedBy: actor,
    updatedAt: new Date().toISOString(),
  };
}

function getTaskMutationErrorMessage(errorCode?: string): string {
  switch (errorCode) {
    case "related-tasks-invalid":
      return "Related tasks must stay active and belong to this project.";
    case "epic-invalid":
      return "Epic must belong to this project.";
    case "assignee-invalid":
      return "Assignee must be a current collaborator on this project.";
    case "deadline-invalid":
      return "Deadline must use a valid date.";
    default:
      return errorCode ?? "Failed to update task";
  }
}

function mapTaskMutationResponseTask(task: TaskMutationResponseTask): KanbanTask {
  return {
    id: task.id,
    title: task.title,
    labels: getTaskLabelsFromStorage(task.labelsJson, task.label),
    description: task.description,
    deadlineDate: task.deadlineDate,
    commentCount: task.commentCount,
    epic: task.epic,
    assignee: task.assignee,
    createdBy: task.createdBy,
    updatedBy: task.updatedBy,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    blockedFollowUps: task.blockedFollowUps.map((entry) => ({
      ...entry,
      createdAt: entry.createdAt,
    })),
    status: task.status,
    position: task.position,
    archivedAt: task.archivedAt,
    relatedTasks: task.relatedTasks,
    attachments: task.attachments,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readRemoteTaskPayload(
  activity: ProjectActivityEventPayload
): KanbanTask | null {
  if (!isRecord(activity.payload) || !isRecord(activity.payload.task)) {
    return null;
  }

  const task = activity.payload.task as Partial<TaskMutationResponseTask>;
  if (typeof task.id !== "string" || typeof task.status !== "string") {
    return null;
  }

  if (!isTaskStatus(task.status)) {
    return null;
  }

  return mapTaskMutationResponseTask(task as TaskMutationResponseTask);
}

function readRemoteTaskCommentPayload(
  activity: ProjectActivityEventPayload
): { taskId: string; comment: TaskComment | null } | null {
  if (!isRecord(activity.payload) || typeof activity.payload.taskId !== "string") {
    return null;
  }

  return {
    taskId: activity.payload.taskId,
    comment: isRecord(activity.payload.comment)
      ? (activity.payload.comment as unknown as TaskComment)
      : null,
  };
}

function readRemoteReorderPayload(
  activity: ProjectActivityEventPayload
): Array<{ status: TaskStatus; taskIds: string[] }> | null {
  if (!isRecord(activity.payload) || !isRecord(activity.payload.reorder)) {
    return null;
  }

  const columns = activity.payload.reorder.columns;
  if (!Array.isArray(columns)) {
    return null;
  }

  const nextColumns: Array<{ status: TaskStatus; taskIds: string[] }> = [];
  for (const column of columns) {
    if (!isRecord(column) || typeof column.status !== "string") {
      return null;
    }

    if (!isTaskStatus(column.status)) {
      return null;
    }

    if (!Array.isArray(column.taskIds)) {
      return null;
    }

    nextColumns.push({
      status: column.status,
      taskIds: column.taskIds.filter(
        (taskId): taskId is string => typeof taskId === "string"
      ),
    });
  }

  return nextColumns;
}

function mergeFetchedTaskComments(
  fetchedComments: TaskComment[],
  currentComments: TaskComment[]
): TaskComment[] {
  const commentsById = new Map<string, TaskComment>();

  fetchedComments.forEach((comment) => {
    commentsById.set(comment.id, comment);
  });

  currentComments.forEach((comment) => {
    if (!commentsById.has(comment.id)) {
      commentsById.set(comment.id, comment);
    }
  });

  return Array.from(commentsById.values()).sort(
    (left, right) =>
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  );
}

function getAttachmentLinkName(url: string): string {
  try {
    return new URL(url).hostname || url;
  } catch {
    return url;
  }
}

export function KanbanBoard({
  canEdit,
  projectId,
  actorUserId,
  storageProvider,
  initialTasks,
  archivedDoneTasks: initialArchivedDoneTasks = [],
  epics,
  collaborators,
  initialTaskId,
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
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);
  const [pendingDeleteTask, setPendingDeleteTask] = useState<KanbanTask | null>(null);
  const [isDeletingTask, setIsDeletingTask] = useState(false);
  const [isArchivingTask, setIsArchivingTask] = useState(false);
  const shouldOpenTaskInEditModeRef = useRef(false);
  const previousSelectedTaskIdRef = useRef<string | null>(null);
  const openedInitialTaskIdRef = useRef<string | null>(null);
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
  const [editDeadlineDate, setEditDeadlineDate] = useState("");
  const [editEpicId, setEditEpicId] = useState("");
  const [editAssigneeUserId, setEditAssigneeUserId] = useState("");
  const [editRelatedTasks, setEditRelatedTasks] = useState<TaskRelatedSummary[]>([]);
  const [relatedTaskSearch, setRelatedTaskSearch] = useState("");
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
  const [taskComments, setTaskComments] = useState<TaskComment[]>([]);
  const [taskCommentsError, setTaskCommentsError] = useState<string | null>(null);
  const [isLoadingTaskComments, setIsLoadingTaskComments] = useState(false);
  const [newTaskComment, setNewTaskComment] = useState("");
  const [isSubmittingTaskComment, setIsSubmittingTaskComment] = useState(false);
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
  const currentActorSummary = useMemo<TaskPersonSummary | null>(
    () => collaborators.find((collaborator) => collaborator.id === actorUserId) ?? null,
    [actorUserId, collaborators]
  );

  const resetTaskEditDraft = useCallback((task: KanbanTask) => {
    setTaskModalError(null);
    setEditTitle(task.title);
    setEditLabels(task.labels);
    setEditLabelInput("");
    setEditDescription(task.description ?? "");
    setEditDeadlineDate(task.deadlineDate ?? "");
    setEditEpicId(task.epic?.id ?? "");
    setEditAssigneeUserId(task.assignee?.id ?? "");
    setEditRelatedTasks(task.relatedTasks);
    setRelatedTaskSearch("");
    setNewBlockedFollowUpEntry("");
    setAttachmentError(null);
    setTaskCommentsError(null);
    setPendingAttachmentUploads([]);
    setIsLinkComposerOpen(false);
    setLinkUrl("");
    setFileInputKey((previous) => previous + 1);
    setPreviewAttachment(null);
    setNewTaskComment("");
  }, []);

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

    const nextTask =
      TASK_STATUSES.flatMap((status) => columns[status]).find(
        (task) => task.id === selectedTask.id
      ) ??
      archivedDoneTasks.find((task) => task.id === selectedTask.id) ??
      null;

    if (!nextTask) {
      setSelectedTask(null);
      return;
    }

    if (nextTask !== selectedTask) {
      setSelectedTask(nextTask);
    }
  }, [archivedDoneTasks, columns, selectedTask]);

  useEffect(() => {
    if (!selectedTask) {
      previousSelectedTaskIdRef.current = null;
      return;
    }

    const hasTaskChanged = previousSelectedTaskIdRef.current !== selectedTask.id;
    previousSelectedTaskIdRef.current = selectedTask.id;

    if (!hasTaskChanged) {
      return;
    }

    setIsEditMode(shouldOpenTaskInEditModeRef.current);
    shouldOpenTaskInEditModeRef.current = false;
    resetTaskEditDraft(selectedTask);
  }, [resetTaskEditDraft, selectedTask]);

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

  const selectedTaskId = selectedTask?.id ?? null;
  const selectedTaskCommentCount = selectedTask?.commentCount ?? 0;
  const selectedTaskUpdatedAt = selectedTask?.updatedAt ?? null;

  useEffect(() => {
    if (!selectedTaskId) {
      setTaskComments([]);
      setTaskCommentsError(null);
      setIsLoadingTaskComments(false);
      setNewTaskComment("");
      return;
    }

    if (isEditMode) {
      return;
    }

    const abortController = new AbortController();
    const loadTaskComments = async () => {
      setIsLoadingTaskComments(true);
      setTaskCommentsError(null);

      try {
        const response = await fetch(
          `/api/projects/${projectId}/tasks/${selectedTaskId}/comments`,
          {
            signal: abortController.signal,
          }
        );

        if (!response.ok) {
          throw new Error(
            await readApiError(response, "Could not load task comments.")
          );
        }

        const payload = (await response.json()) as {
          comments: TaskComment[];
        };

        setTaskComments((currentComments) =>
          mergeFetchedTaskComments(payload.comments, currentComments)
        );
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        console.error("[KanbanBoard.loadTaskComments]", error);
        setTaskComments([]);
        setTaskCommentsError(
          error instanceof Error ? error.message : "Could not load task comments."
        );
      } finally {
        if (!abortController.signal.aborted) {
          setIsLoadingTaskComments(false);
        }
      }
    };

    void loadTaskComments();

    return () => {
      abortController.abort();
    };
  }, [
    isEditMode,
    projectId,
    selectedTaskCommentCount,
    selectedTaskId,
    selectedTaskUpdatedAt,
  ]);

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

  const isSelectedTaskArchived = useMemo(() => {
    if (!selectedTask) {
      return false;
    }

    return archivedDoneTasks.some((task) => task.id === selectedTask.id);
  }, [archivedDoneTasks, selectedTask]);

  const allTasks = useMemo(
    () => [...TASK_STATUSES.flatMap((status) => columns[status]), ...archivedDoneTasks],
    [archivedDoneTasks, columns]
  );

  const taskById = useMemo(
    () => new Map(allTasks.map((task) => [task.id, task])),
    [allTasks]
  );

  const normalizedInitialTaskId =
    typeof initialTaskId === "string" ? initialTaskId.trim() : "";

  useEffect(() => {
    if (
      !normalizedInitialTaskId ||
      openedInitialTaskIdRef.current === normalizedInitialTaskId
    ) {
      return;
    }

    const initialTask = taskById.get(normalizedInitialTaskId);
    openedInitialTaskIdRef.current = normalizedInitialTaskId;
    if (!initialTask) {
      return;
    }

    shouldOpenTaskInEditModeRef.current = false;
    setSelectedTask(initialTask);
    setIsExpanded(true);
  }, [normalizedInitialTaskId, setIsExpanded, taskById]);

  const relatedTaskGraph = useMemo(() => createRelatedTaskMap(allTasks), [allTasks]);

  const highlightedTaskIds = useMemo(() => {
    if (!hoveredTaskId) {
      return new Set<string>();
    }

    const connectedTaskIds = relatedTaskGraph.get(hoveredTaskId) ?? [];
    return new Set([hoveredTaskId, ...connectedTaskIds]);
  }, [hoveredTaskId, relatedTaskGraph]);

  const availableRelatedTaskOptions = useMemo<RelatedTaskOption[]>(() => {
    if (!selectedTask) {
      return [];
    }

    return TASK_STATUSES.flatMap((status) => columns[status])
      .filter((task) => task.id !== selectedTask.id)
      .map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
      }))
      .sort((left, right) => left.title.localeCompare(right.title));
  }, [columns, selectedTask]);

  const createDialogAvailableTasks = useMemo<RelatedTaskOption[]>(
    () =>
      TASK_STATUSES.flatMap((status) => columns[status])
        .map((task) => ({
          id: task.id,
          title: task.title,
          status: task.status,
        }))
        .sort((left, right) => left.title.localeCompare(right.title)),
    [columns]
  );

  const availableEpicOptions = useMemo<ProjectEpicOption[]>(
    () => [...epics].sort((left, right) => left.name.localeCompare(right.name)),
    [epics]
  );

  const availableAssignees = useMemo<ProjectTaskCollaborator[]>(
    () =>
      [...collaborators].sort((left, right) =>
        left.displayName.localeCompare(right.displayName)
      ),
    [collaborators]
  );

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

  const addRelatedTask = useCallback(
    (taskId: string) => {
      const relatedTask = taskById.get(taskId);
      if (!selectedTask || !relatedTask) {
        return;
      }

      setEditRelatedTasks((previousTasks) => {
        if (previousTasks.some((entry) => entry.id === taskId)) {
          return previousTasks;
        }

        return [
          ...previousTasks,
          {
            id: relatedTask.id,
            title: relatedTask.title,
            status: relatedTask.status,
            archivedAt: relatedTask.archivedAt,
          },
        ].sort((left, right) => left.title.localeCompare(right.title));
      });
      setRelatedTaskSearch("");
    },
    [selectedTask, taskById]
  );

  const removeRelatedTask = useCallback((taskId: string) => {
    setEditRelatedTasks((previousTasks) =>
      previousTasks.filter((entry) => entry.id !== taskId)
    );
  }, []);

  const syncRelatedTaskSummary = useCallback(
    (
      taskId: string,
      nextSummary: {
        title: string;
        status: string;
        archivedAt: string | null;
      }
    ) => {
      const updateTaskReferences = (task: KanbanTask): KanbanTask => {
        const hasReference = task.relatedTasks.some((entry) => entry.id === taskId);
        if (!hasReference) {
          return task;
        }

        return {
          ...task,
          relatedTasks: task.relatedTasks.map((entry) =>
            entry.id === taskId
              ? {
                  ...entry,
                  ...nextSummary,
                }
              : entry
          ),
        };
      };

      setColumns((previousColumns) => {
        let hasChanges = false;
        const nextColumns = createEmptyColumns<KanbanTask>();

        TASK_STATUSES.forEach((status) => {
          nextColumns[status] = previousColumns[status].map((task) => {
            const nextTask = updateTaskReferences(task);
            if (nextTask !== task) {
              hasChanges = true;
            }
            return nextTask;
          });
        });

        return hasChanges ? nextColumns : previousColumns;
      });

      setArchivedDoneTasks((previousTasks) => {
        let hasChanges = false;
        const nextTasks = previousTasks.map((task) => {
          const nextTask = updateTaskReferences(task);
          if (nextTask !== task) {
            hasChanges = true;
          }
          return nextTask;
        });

        return hasChanges ? nextTasks : previousTasks;
      });
    },
    []
  );

  const removeRelatedTaskReferences = useCallback((taskId: string) => {
    const stripReference = (task: KanbanTask): KanbanTask => {
      if (!task.relatedTasks.some((entry) => entry.id === taskId)) {
        return task;
      }

      return {
        ...task,
        relatedTasks: task.relatedTasks.filter((entry) => entry.id !== taskId),
      };
    };

    setColumns((previousColumns) => {
      let hasChanges = false;
      const nextColumns = createEmptyColumns<KanbanTask>();

      TASK_STATUSES.forEach((status) => {
        nextColumns[status] = previousColumns[status].map((task) => {
          const nextTask = stripReference(task);
          if (nextTask !== task) {
            hasChanges = true;
          }
          return nextTask;
        });
      });

      return hasChanges ? nextColumns : previousColumns;
    });

    setArchivedDoneTasks((previousTasks) => {
      let hasChanges = false;
      const nextTasks = previousTasks.map((task) => {
        const nextTask = stripReference(task);
        if (nextTask !== task) {
          hasChanges = true;
        }
        return nextTask;
      });

      return hasChanges ? nextTasks : previousTasks;
    });
  }, []);

  const persistColumns = useCallback(
    async (
      nextColumns: TaskColumns<KanbanTask>,
      previousColumns: TaskColumns<KanbanTask>
    ) => {
      try {
        const response = await fetchProjectActivityMutation(
          projectId,
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
      if (!canEdit) {
        return;
      }

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

      nextColumns[destinationStatus].splice(
        destination.index,
        0,
        stampTaskActivity(
          {
            ...movedTask,
            status: destinationStatus,
          },
          currentActorSummary
        )
      );

      setColumns(nextColumns);
      syncRelatedTaskSummary(movedTask.id, {
        title: movedTask.title,
        status: destinationStatus,
        archivedAt: null,
      });
      setPersistError(null);

      startTransition(() => {
        void persistColumns(nextColumns, previousColumns);
      });
    },
    [canEdit, columns, currentActorSummary, persistColumns, syncRelatedTaskSummary]
  );

  const closeTaskModal = useCallback(() => {
    setSelectedTask(null);
    shouldOpenTaskInEditModeRef.current = false;
    setIsEditMode(false);
    setTaskModalError(null);
    setAttachmentError(null);
    setTaskCommentsError(null);
    setEditRelatedTasks([]);
    setEditAssigneeUserId("");
    setRelatedTaskSearch("");
    setPreviewAttachment(null);
    setTaskComments([]);
    setNewTaskComment("");
  }, []);

  const handleSelectTask = useCallback((task: KanbanTask) => {
    shouldOpenTaskInEditModeRef.current = false;
    setTaskComments([]);
    setTaskCommentsError(null);
    setNewTaskComment("");
    setSelectedTask(task);
  }, []);

  const openTaskInEditMode = useCallback((task: KanbanTask) => {
    if (!canEdit) {
      return;
    }

    shouldOpenTaskInEditModeRef.current = true;
    setTaskComments([]);
    setTaskCommentsError(null);
    setNewTaskComment("");
    setSelectedTask(task);
  }, [canEdit]);

  const openRelatedTask = useCallback(
    (taskId: string) => {
      const relatedTask = taskById.get(taskId);
      if (!relatedTask) {
        return;
      }

      shouldOpenTaskInEditModeRef.current = false;
      setTaskComments([]);
      setTaskCommentsError(null);
      setNewTaskComment("");
      setSelectedTask(relatedTask);
    },
    [taskById]
  );

  const handleActivateTaskEditMode = useCallback(() => {
    if (!canEdit) {
      return;
    }

    if (selectedTask) {
      resetTaskEditDraft(selectedTask);
    }
    setIsEditMode(true);
    setTaskModalError(null);
  }, [canEdit, resetTaskEditDraft, selectedTask]);

  const handleToggleTaskEditMode = useCallback(
    (nextValue: boolean) => {
      if (!canEdit) {
        return;
      }

      if (!nextValue && selectedTask) {
        resetTaskEditDraft(selectedTask);
      }

      setIsEditMode(nextValue);
      setTaskModalError(null);
    },
    [canEdit, resetTaskEditDraft, selectedTask]
  );

  const applyUpdatedTask = useCallback(
    (updatedTask: KanbanTask) => {
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
        const taskIndex = previousArchivedTasks.findIndex((task) => task.id === updatedTask.id);

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

      setSelectedTask((previousTask) => {
        if (!previousTask || previousTask.id !== updatedTask.id) {
          return previousTask;
        }
        return updatedTask;
      });
      setEditEpicId(updatedTask.epic?.id ?? "");
      setEditAssigneeUserId(updatedTask.assignee?.id ?? "");
      syncRelatedTaskSummary(updatedTask.id, {
        title: updatedTask.title,
        status: updatedTask.status,
        archivedAt: updatedTask.archivedAt,
      });
    },
    [syncRelatedTaskSummary]
  );

  const insertCreatedTask = useCallback(
    (createdTask: KanbanTask) => {
      setColumns((previousColumns) => {
        const nextColumns = cloneColumns(previousColumns);
        const targetColumn = nextColumns[createdTask.status];
        const existingIndex = targetColumn.findIndex(
          (task) => task.id === createdTask.id
        );

        if (existingIndex >= 0) {
          targetColumn[existingIndex] = createdTask;
        } else {
          targetColumn.push(createdTask);
        }

        targetColumn.sort((left, right) => left.position - right.position);

        createdTask.relatedTasks.forEach((relatedTask) => {
          if (!isTaskStatus(relatedTask.status)) {
            return;
          }

          const relatedColumn = nextColumns[relatedTask.status];
          const relatedIndex = relatedColumn.findIndex(
            (task) => task.id === relatedTask.id
          );
          if (relatedIndex === -1) {
            return;
          }

          const relatedColumnTask = relatedColumn[relatedIndex];
          if (
            relatedColumnTask.relatedTasks.some(
              (task) => task.id === createdTask.id
            )
          ) {
            return;
          }

          relatedColumn[relatedIndex] = {
            ...relatedColumnTask,
            relatedTasks: [
              ...relatedColumnTask.relatedTasks,
              {
                id: createdTask.id,
                title: createdTask.title,
                status: createdTask.status,
                archivedAt: createdTask.archivedAt,
              },
            ].sort((left, right) => left.title.localeCompare(right.title)),
          };
        });

        return nextColumns;
      });

      setIsExpanded(true);
      setPersistError(null);
    },
    [setIsExpanded]
  );

  const upsertRemoteTask = useCallback(
    (remoteTask: KanbanTask) => {
      setColumns((previousColumns) => {
        const nextColumns = createEmptyColumns<KanbanTask>();
        TASK_STATUSES.forEach((status) => {
          nextColumns[status] = previousColumns[status].filter(
            (task) => task.id !== remoteTask.id
          );
        });

        if (!remoteTask.archivedAt && isTaskStatus(remoteTask.status)) {
          nextColumns[remoteTask.status] = [
            ...nextColumns[remoteTask.status],
            remoteTask,
          ].sort((left, right) => left.position - right.position);
        }

        return nextColumns;
      });

      setArchivedDoneTasks((previousTasks) => {
        const withoutRemoteTask = previousTasks.filter(
          (task) => task.id !== remoteTask.id
        );
        if (remoteTask.status === "Done" && remoteTask.archivedAt) {
          return [...withoutRemoteTask, remoteTask].sort(
            (left, right) =>
              Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
          );
        }

        return withoutRemoteTask;
      });

      setSelectedTask((previousTask) => {
        if (!previousTask || previousTask.id !== remoteTask.id) {
          return previousTask;
        }
        return remoteTask;
      });

      syncRelatedTaskSummary(remoteTask.id, {
        title: remoteTask.title,
        status: remoteTask.status,
        archivedAt: remoteTask.archivedAt,
      });
      setIsExpanded(true);
      setPersistError(null);
    },
    [setIsExpanded, syncRelatedTaskSummary]
  );

  const applyRemoteReorder = useCallback(
    (reorderedColumns: Array<{ status: TaskStatus; taskIds: string[] }>) => {
      setColumns((previousColumns) => {
        const taskById = new Map<string, KanbanTask>();
        TASK_STATUSES.forEach((status) => {
          previousColumns[status].forEach((task) => {
            taskById.set(task.id, task);
          });
        });

        const nextColumns = createEmptyColumns<KanbanTask>();
        const usedTaskIds = new Set<string>();
        reorderedColumns.forEach((column) => {
          column.taskIds.forEach((taskId, position) => {
            const task = taskById.get(taskId);
            if (!task) {
              return;
            }

            usedTaskIds.add(taskId);
            nextColumns[column.status].push({
              ...task,
              status: column.status,
              position,
              archivedAt: null,
            });
          });
        });

        TASK_STATUSES.forEach((status) => {
          previousColumns[status].forEach((task) => {
            if (!usedTaskIds.has(task.id)) {
              nextColumns[status].push(task);
            }
          });
          nextColumns[status].sort((left, right) => left.position - right.position);
        });

        return nextColumns;
      });

      setPersistError(null);
    },
    []
  );

  const removeLocalTask = useCallback(
    (taskId: string) => {
      setColumns((previousColumns) => {
        const nextColumns = createEmptyColumns<KanbanTask>();
        TASK_STATUSES.forEach((status) => {
          nextColumns[status] = previousColumns[status].filter(
            (task) => task.id !== taskId
          );
        });
        return nextColumns;
      });
      setArchivedDoneTasks((previousTasks) =>
        previousTasks.filter((task) => task.id !== taskId)
      );
      setSelectedTask((previousTask) => {
        if (!previousTask || previousTask.id !== taskId) {
          return previousTask;
        }
        return null;
      });
      removeRelatedTaskReferences(taskId);
    },
    [removeRelatedTaskReferences]
  );

  const replaceOptimisticTaskWithCreatedTask = useCallback(
    (optimisticTaskId: string, createdTask: KanbanTask) => {
      const createdTaskSummary: TaskRelatedSummary = {
        id: createdTask.id,
        title: createdTask.title,
        status: createdTask.status,
        archivedAt: createdTask.archivedAt,
      };
      const createdRelatedTaskIds = new Set(
        createdTask.relatedTasks.map((task) => task.id)
      );
      const replaceRelatedReferences = (task: KanbanTask): KanbanTask => {
        const nextRelatedTasks = task.relatedTasks.filter(
          (relatedTask) =>
            relatedTask.id !== optimisticTaskId &&
            relatedTask.id !== createdTask.id
        );

        if (createdRelatedTaskIds.has(task.id)) {
          nextRelatedTasks.push(createdTaskSummary);
        }

        const sortedRelatedTasks = nextRelatedTasks.sort((left, right) =>
          left.title.localeCompare(right.title)
        );
        const hasChanged =
          sortedRelatedTasks.length !== task.relatedTasks.length ||
          sortedRelatedTasks.some(
            (relatedTask, index) =>
              task.relatedTasks[index]?.id !== relatedTask.id ||
              task.relatedTasks[index]?.title !== relatedTask.title ||
              task.relatedTasks[index]?.status !== relatedTask.status ||
              task.relatedTasks[index]?.archivedAt !== relatedTask.archivedAt
          );

        return hasChanged
          ? {
              ...task,
              relatedTasks: sortedRelatedTasks,
            }
          : task;
      };

      setColumns((previousColumns) => {
        const nextColumns = createEmptyColumns<KanbanTask>();

        TASK_STATUSES.forEach((status) => {
          nextColumns[status] = previousColumns[status]
            .filter(
              (task) =>
                task.id !== optimisticTaskId && task.id !== createdTask.id
            )
            .map(replaceRelatedReferences);
        });

        nextColumns[createdTask.status].push(createdTask);
        nextColumns[createdTask.status].sort(
          (left, right) => left.position - right.position
        );

        return nextColumns;
      });
      setArchivedDoneTasks((previousTasks) =>
        previousTasks
          .filter(
            (task) => task.id !== optimisticTaskId && task.id !== createdTask.id
          )
          .map(replaceRelatedReferences)
      );
      setSelectedTask((previousTask) => {
        if (
          !previousTask ||
          (previousTask.id !== optimisticTaskId && previousTask.id !== createdTask.id)
        ) {
          return previousTask;
        }

        return createdTask;
      });
      setIsExpanded(true);
      setPersistError(null);
    },
    [setIsExpanded]
  );

  const insertOptimisticTask = useCallback(
    (draft: TaskCreateOptimisticDraft): string | null => {
      if (!currentActorSummary) {
        return null;
      }

      const now = new Date().toISOString();
      const optimisticTaskId = `optimistic-task-${Date.now()}-${Math.random()
        .toString(16)
        .slice(2)}`;
      const backlogPositions = columns.Backlog.map((task) => task.position);
      const nextPosition =
        backlogPositions.length > 0 ? Math.max(...backlogPositions) + 1 : 0;
      const relatedTasks = draft.relatedTaskIds
        .map((taskId) => taskById.get(taskId))
        .filter((task): task is KanbanTask => Boolean(task))
        .map((task) => ({
          id: task.id,
          title: task.title,
          status: task.status,
          archivedAt: task.archivedAt,
        }))
        .sort((left, right) => left.title.localeCompare(right.title));

      const optimisticAttachments = draft.attachmentLinks.map((link) => ({
        id: `optimistic-attachment-${link.id}`,
        kind: ATTACHMENT_KIND_LINK,
        name: getAttachmentLinkName(link.url),
        url: link.url,
        mimeType: null,
        sizeBytes: null,
        downloadUrl: null,
      }));

      insertCreatedTask({
        id: optimisticTaskId,
        title: draft.title,
        labels: draft.labels,
        description: draft.description,
        deadlineDate: draft.deadlineDate,
        commentCount: 0,
        blockedFollowUps: [],
        status: "Backlog",
        position: nextPosition,
        archivedAt: null,
        attachments: optimisticAttachments,
        relatedTasks,
        epic:
          availableEpicOptions.find((epic) => epic.id === draft.epicId) ?? null,
        assignee:
          availableAssignees.find(
            (assignee) => assignee.id === draft.assigneeUserId
          ) ?? null,
        createdBy: currentActorSummary,
        updatedBy: currentActorSummary,
        createdAt: now,
        updatedAt: now,
      });

      return optimisticTaskId;
    },
    [
      availableAssignees,
      availableEpicOptions,
      columns.Backlog,
      currentActorSummary,
      insertCreatedTask,
      taskById,
    ]
  );

  const patchSelectedTask = useCallback(
    async ({
      payload,
      successMessage,
      fallbackErrorMessage,
    }: {
      payload: Record<string, unknown>;
      successMessage: string;
      fallbackErrorMessage: string;
    }) => {
      if (!selectedTask || !canEdit) {
        return false;
      }

      setIsUpdatingTask(true);
      setTaskModalError(null);

      try {
        const response = await fetchProjectActivityMutation(
          projectId,
          `/api/projects/${projectId}/tasks/${selectedTask.id}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              title: selectedTask.title,
              labels: selectedTask.labels,
              description: selectedTask.description ?? "",
              deadlineDate: selectedTask.deadlineDate ?? null,
              relatedTaskIds: selectedTask.relatedTasks.map((task) => task.id),
              ...payload,
            }),
          }
        );

        if (!response.ok) {
          const responsePayload = (await response.json().catch(() => null)) as
            | {
                error?: string;
              }
            | null;
          throw new Error(getTaskMutationErrorMessage(responsePayload?.error));
        }

        const responsePayload = (await response.json()) as {
          task: TaskMutationResponseTask;
        };

        if (!isTaskStatus(responsePayload.task.status)) {
          throw new Error("Invalid task status returned by server");
        }

        const updatedTask = mapTaskMutationResponseTask(responsePayload.task);
        applyUpdatedTask(updatedTask);
        pushToast({
          variant: "success",
          message: successMessage,
        });
        return true;
      } catch (error) {
        console.error("[KanbanBoard.patchSelectedTask]", error);
        const message =
          error instanceof Error ? error.message : fallbackErrorMessage;
        setTaskModalError(message);
        pushToast({
          variant: "error",
          message,
        });
        return false;
      } finally {
        setIsUpdatingTask(false);
      }
    },
    [applyUpdatedTask, canEdit, projectId, pushToast, selectedTask]
  );

  const persistTaskChanges = useCallback(
    async (options?: { exitEditMode?: boolean }) => {
      if (!selectedTask) {
        return false;
      }

      if (!canEdit) {
        return false;
      }

      const normalizedTitle = editTitle.trim();
      const normalizedBlockedEntry = newBlockedFollowUpEntry.trim();
      const relatedTaskIds = editRelatedTasks.map((task) => task.id);

      if (normalizedTitle.length < 2) {
        setTaskModalError("Task title must be at least 2 characters.");
        return false;
      }

      setIsUpdatingTask(true);

      try {
        const response = await fetchProjectActivityMutation(
          projectId,
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
              deadlineDate: editDeadlineDate || null,
              epicId: editEpicId || null,
              assigneeUserId: editAssigneeUserId || null,
              blockedFollowUpEntry: normalizedBlockedEntry,
              relatedTaskIds,
            }),
          }
        );

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(getTaskMutationErrorMessage(payload?.error));
        }

        const payload = (await response.json()) as {
          task: TaskMutationResponseTask;
        };

        if (!isTaskStatus(payload.task.status)) {
          throw new Error("Invalid task status returned by server");
        }

        const updatedTask = mapTaskMutationResponseTask(payload.task);
        applyUpdatedTask(updatedTask);
        setTaskModalError(null);
        if (options?.exitEditMode !== false) {
          setIsEditMode(false);
        }
        setNewBlockedFollowUpEntry("");
        return true;
      } catch (error) {
        console.error("[KanbanBoard.handleTaskUpdate]", error);
        setTaskModalError(
          error instanceof Error ? error.message : "Could not save task changes."
        );
        return false;
      } finally {
        setIsUpdatingTask(false);
      }
    },
    [
      canEdit,
      editAssigneeUserId,
      editDeadlineDate,
      editDescription,
      editEpicId,
      editLabels,
      editRelatedTasks,
      editTitle,
      newBlockedFollowUpEntry,
      projectId,
      selectedTask,
      applyUpdatedTask,
    ]
  );

  const handleQuickEpicUpdate = useCallback(
    async (nextEpicId: string) => {
      const nextEpicLabel =
        availableEpicOptions.find((epic) => epic.id === nextEpicId)?.name ?? null;

      await patchSelectedTask({
        payload: {
          epicId: nextEpicId || null,
        },
        successMessage: nextEpicLabel
          ? `Epic updated to ${nextEpicLabel}.`
          : "Epic cleared.",
        fallbackErrorMessage: "Could not update epic.",
      });
    },
    [availableEpicOptions, patchSelectedTask]
  );

  const handleQuickAssigneeUpdate = useCallback(
    async (nextAssigneeUserId: string) => {
      const nextAssigneeLabel =
        availableAssignees.find((assignee) => assignee.id === nextAssigneeUserId)
          ?.displayName ?? null;

      await patchSelectedTask({
        payload: {
          assigneeUserId: nextAssigneeUserId || null,
        },
        successMessage: nextAssigneeLabel
          ? `Assignee updated to ${nextAssigneeLabel}.`
          : "Assignee cleared.",
        fallbackErrorMessage: "Could not update assignee.",
      });
    },
    [availableAssignees, patchSelectedTask]
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
      if (!canEdit) {
        return;
      }

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

      nextColumns[nextStatus].unshift(
        stampTaskActivity(
          {
            ...movedTask,
            status: nextStatus,
            archivedAt: null,
          },
          currentActorSummary
        )
      );

      setColumns(nextColumns);
      setSelectedTask((previousTask) => {
        if (!previousTask || previousTask.id !== task.id) {
          return previousTask;
        }
        return stampTaskActivity(
          {
            ...previousTask,
            status: nextStatus,
            archivedAt: null,
          },
          currentActorSummary
        );
      });
      syncRelatedTaskSummary(task.id, {
        title: task.title,
        status: nextStatus,
        archivedAt: null,
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
    [
      canEdit,
      columns,
      currentActorSummary,
      persistColumns,
      pushToast,
      syncRelatedTaskSummary,
    ]
  );

  const confirmDeleteTask = useCallback(async () => {
    if (!canEdit) {
      return;
    }

    if (!pendingDeleteTask || isDeletingTask) {
      return;
    }

    setIsDeletingTask(true);

    try {
      const response = await fetchProjectActivityMutation(
        projectId,
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
      removeRelatedTaskReferences(pendingDeleteTask.id);

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
  }, [canEdit, isDeletingTask, pendingDeleteTask, projectId, pushToast, removeRelatedTaskReferences]);

  const handleArchiveTask = useCallback(async () => {
    if (!canEdit) {
      return;
    }

    if (!selectedTask || isArchivingTask) {
      return;
    }

    setIsArchivingTask(true);

    try {
      const response = await fetchProjectActivityMutation(
        projectId,
        `/api/projects/${projectId}/tasks/${selectedTask.id}/archive`,
        {
          method: "POST",
        }
      );

      if (!response.ok) {
        throw new Error(await readApiError(response, "Could not archive task."));
      }

      const payload = (await response.json()) as { archivedAt: string };

      const taskToArchive = selectedTask;
      const archivedTask = stampTaskActivity(
        {
          ...taskToArchive,
          archivedAt: payload.archivedAt,
        },
        currentActorSummary
      );

      setColumns((previousColumns) => {
        const nextColumns = createEmptyColumns<KanbanTask>();
        TASK_STATUSES.forEach((status) => {
          nextColumns[status] = previousColumns[status].filter(
            (task) => task.id !== taskToArchive.id
          );
        });
        return nextColumns;
      });
      setArchivedDoneTasks((previousTasks) => {
        const withoutTask = previousTasks.filter((task) => task.id !== taskToArchive.id);
        return [archivedTask, ...withoutTask];
      });
      syncRelatedTaskSummary(taskToArchive.id, {
        title: taskToArchive.title,
        status: taskToArchive.status,
        archivedAt: payload.archivedAt,
      });
      closeTaskModal();
      pushToast({
        variant: "success",
        message: "Task moved to archive.",
      });
    } catch (error) {
      console.error("[KanbanBoard.handleArchiveTask]", error);
      pushToast({
        variant: "error",
        message: error instanceof Error ? error.message : "Could not archive task.",
      });
    } finally {
      setIsArchivingTask(false);
    }
  }, [
    canEdit,
    closeTaskModal,
    currentActorSummary,
    isArchivingTask,
    projectId,
    pushToast,
    selectedTask,
    syncRelatedTaskSummary,
  ]);

  const handleUnarchiveTask = useCallback(async () => {
    if (!canEdit) {
      return;
    }

    if (!selectedTask || !isSelectedTaskArchived || isArchivingTask) {
      return;
    }

    setIsArchivingTask(true);

    try {
      const response = await fetchProjectActivityMutation(
        projectId,
        `/api/projects/${projectId}/tasks/${selectedTask.id}/archive`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        throw new Error(await readApiError(response, "Could not unarchive task."));
      }

      const taskToRestore = stampTaskActivity(
        {
          ...selectedTask,
          archivedAt: null,
        },
        currentActorSummary
      );

      setArchivedDoneTasks((previousTasks) =>
        previousTasks.filter((task) => task.id !== taskToRestore.id)
      );
      setColumns((previousColumns) => {
        const nextColumns = cloneColumns(previousColumns);
        const alreadyPresent = nextColumns.Done.some((task) => task.id === taskToRestore.id);
        if (alreadyPresent) {
          return previousColumns;
        }

        nextColumns.Done = [taskToRestore, ...nextColumns.Done];
        return nextColumns;
      });
      setSelectedTask(taskToRestore);
      syncRelatedTaskSummary(taskToRestore.id, {
        title: taskToRestore.title,
        status: taskToRestore.status,
        archivedAt: null,
      });
      pushToast({
        variant: "success",
        message: "Task moved back to Done.",
      });
    } catch (error) {
      console.error("[KanbanBoard.handleUnarchiveTask]", error);
      pushToast({
        variant: "error",
        message: error instanceof Error ? error.message : "Could not unarchive task.",
      });
    } finally {
      setIsArchivingTask(false);
    }
  }, [
    canEdit,
    currentActorSummary,
    isArchivingTask,
    isSelectedTaskArchived,
    projectId,
    pushToast,
    selectedTask,
    syncRelatedTaskSummary,
  ]);

  const handleAddBlockedFollowUpEntry = useCallback(async () => {
    if (!canEdit) {
      return;
    }

    if (!newBlockedFollowUpEntry.trim()) {
      return;
    }
    await persistTaskChanges({ exitEditMode: false });
  }, [canEdit, newBlockedFollowUpEntry, persistTaskChanges]);

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

  useEffect(() => {
    function handleRemoteProjectActivity(event: Event) {
      const detail = (event as CustomEvent<ProjectActivityRemoteEventDetail>)
        .detail;
      const activity = detail?.activity;
      if (!activity || activity.projectId !== projectId) {
        return;
      }

      if (activity.domain === "task") {
        if (activity.action === "created" || activity.action === "updated") {
          const remoteTask = readRemoteTaskPayload(activity);
          if (!remoteTask) {
            return;
          }

          upsertRemoteTask(remoteTask);
          detail.markHandled();
          return;
        }

        if (activity.action === "deleted" && activity.entityId) {
          removeLocalTask(activity.entityId);
          detail.markHandled();
          return;
        }

        if (activity.action === "reordered") {
          const reorderedColumns = readRemoteReorderPayload(activity);
          if (!reorderedColumns) {
            return;
          }

          applyRemoteReorder(reorderedColumns);
          detail.markHandled();
        }
      }

      if (activity.domain === "task-comment" && activity.action === "created") {
        const commentPayload = readRemoteTaskCommentPayload(activity);
        if (!commentPayload) {
          return;
        }

        applyTaskMutation(commentPayload.taskId, (task) => ({
          ...task,
          commentCount: task.commentCount + 1,
        }));

        if (selectedTask?.id === commentPayload.taskId && commentPayload.comment) {
          setTaskComments((previousComments) =>
            previousComments.some((comment) => comment.id === commentPayload.comment?.id)
              ? previousComments
              : [...previousComments, commentPayload.comment as TaskComment]
          );
        }

        detail.markHandled();
      }
    }

    window.addEventListener(
      PROJECT_ACTIVITY_REMOTE_EVENT,
      handleRemoteProjectActivity
    );

    return () => {
      window.removeEventListener(
        PROJECT_ACTIVITY_REMOTE_EVENT,
        handleRemoteProjectActivity
      );
    };
  }, [
    applyRemoteReorder,
    applyTaskMutation,
    projectId,
    removeLocalTask,
    selectedTask?.id,
    upsertRemoteTask,
  ]);

  const handleSubmitTaskComment = useCallback(async (
    mentionSelections?: TaskCommentMentionSelection[]
  ) => {
    if (!canEdit) {
      return;
    }

    if (!selectedTask) {
      return;
    }

    const content = newTaskComment.trim();
    if (!content) {
      setTaskCommentsError("Comment cannot be empty.");
      return;
    }

    setIsSubmittingTaskComment(true);
    setTaskCommentsError(null);
    const optimisticCommentId = `optimistic-comment-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}`;
    const optimisticComment: TaskComment | null = currentActorSummary
      ? {
          id: optimisticCommentId,
          content,
          createdAt: new Date().toISOString(),
          author: {
            ...currentActorSummary,
            kind: "user",
          },
          reactions: [],
        }
      : null;

    if (optimisticComment) {
      setTaskComments((previousComments) => [
        ...previousComments,
        optimisticComment,
      ]);
      setNewTaskComment("");
      applyTaskMutation(selectedTask.id, (task) =>
        stampTaskActivity(
          {
            ...task,
            commentCount: task.commentCount + 1,
          },
          currentActorSummary
        )
      );
    }

    try {
      const response = await fetchProjectActivityMutation(
        projectId,
        `/api/projects/${projectId}/tasks/${selectedTask.id}/comments`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content,
            mentionSelections,
          }),
        }
      );

      if (!response.ok) {
        const message = await readApiError(response, "Could not add comment.");
        throw new Error(
          message === "content-required"
            ? "Comment cannot be empty."
            : message === "content-too-long"
              ? "Comment must be 4000 characters or fewer."
              : message
        );
      }

      const payload = (await response.json()) as {
        comment: TaskComment;
      };

      setTaskComments((previousComments) =>
        optimisticComment
          ? previousComments.some((comment) => comment.id === optimisticCommentId)
            ? previousComments.map((comment) =>
                comment.id === optimisticCommentId ? payload.comment : comment
              )
            : [...previousComments, payload.comment]
          : [...previousComments, payload.comment]
      );
      setNewTaskComment("");
      if (!optimisticComment) {
        applyTaskMutation(selectedTask.id, (task) =>
          stampTaskActivity(
            {
              ...task,
              commentCount: task.commentCount + 1,
            },
            currentActorSummary
          )
        );
      }
      pushToast({
        variant: "success",
        message: "Comment added.",
      });
    } catch (error) {
      console.error("[KanbanBoard.handleSubmitTaskComment]", error);
      const message =
        error instanceof Error ? error.message : "Could not add comment.";
      if (optimisticComment) {
        setTaskComments((previousComments) =>
          previousComments.filter((comment) => comment.id !== optimisticCommentId)
        );
        applyTaskMutation(selectedTask.id, (task) =>
          stampTaskActivity(
            {
              ...task,
              commentCount: Math.max(0, task.commentCount - 1),
            },
            currentActorSummary
          )
        );
        setNewTaskComment(content);
      }
      setTaskCommentsError(message);
      pushToast({
        variant: "error",
        message,
      });
    } finally {
      setIsSubmittingTaskComment(false);
    }
  }, [
    applyTaskMutation,
    canEdit,
    currentActorSummary,
    newTaskComment,
    projectId,
    pushToast,
    selectedTask,
  ]);

  const handleAddLinkAttachment = useCallback(async () => {
    if (!canEdit) {
      return;
    }

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

      const response = await fetchProjectActivityMutation(
        projectId,
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
      applyTaskMutation(selectedTask.id, (task) =>
        stampTaskActivity(
          {
            ...task,
            attachments: [payload.attachment, ...task.attachments],
          },
          currentActorSummary
        )
      );
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
  }, [
    applyTaskMutation,
    canEdit,
    currentActorSummary,
    linkUrl,
    projectId,
    pushToast,
    selectedTask,
  ]);

  const handleAddFileAttachment = useCallback(
    async (selectedFile: File | null) => {
      if (!canEdit) {
        return;
      }

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

          const response = await fetchProjectActivityMutation(
            projectId,
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

        applyTaskMutation(taskId, (task) =>
          stampTaskActivity(
            {
              ...task,
              attachments: [attachment, ...task.attachments],
            },
            currentActorSummary
          )
        );
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
      canEdit,
      currentActorSummary,
      maxAttachmentFileSizeBytes,
      projectId,
      selectedTask,
      storageProvider,
      pushToast,
    ]
  );

  const handleDeleteAttachment = useCallback(
    async (attachmentId: string) => {
      if (!canEdit) {
        return;
      }

      if (!selectedTask) {
        return;
      }

      setIsSubmittingAttachment(true);
      setAttachmentError(null);

      try {
        const response = await fetchProjectActivityMutation(
          projectId,
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

        applyTaskMutation(selectedTask.id, (task) =>
          stampTaskActivity(
            {
              ...task,
              attachments: task.attachments.filter(
                (attachment) => attachment.id !== attachmentId
              ),
            },
            currentActorSummary
          )
        );
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
    [applyTaskMutation, canEdit, currentActorSummary, projectId, pushToast, selectedTask]
  );

  const totalTaskCount = useMemo(
    () =>
      TASK_STATUSES.reduce((count, status) => count + columns[status].length, 0) +
      archivedDoneTasks.length,
    [archivedDoneTasks.length, columns]
  );
  const deadlineSummary = useMemo(() => {
    return TASK_STATUSES.flatMap((status) => columns[status]).reduce(
      (summary, task) => {
        const urgency = getTaskDeadlineUrgency({
          deadlineDate: task.deadlineDate,
          status: task.status,
          archivedAt: task.archivedAt,
        });

        if (urgency === "overdue") {
          summary.overdueCount += 1;
        } else if (urgency === "soon") {
          summary.soonCount += 1;
        }

        return summary;
      },
      { overdueCount: 0, soonCount: 0 }
    );
  }, [columns]);

  return (
    <div
      className="space-y-4"
      data-project-live-refresh-lock={
        isSaving ||
        isUpdatingTask ||
        isSubmittingAttachment ||
        isSubmittingTaskComment ||
        Boolean(selectedTask) ||
        Boolean(pendingDeleteTask)
          ? "true"
          : undefined
      }
    >
      <KanbanBoardHeader
        isExpanded={isExpanded}
        totalTaskCount={totalTaskCount}
        overdueDeadlineCount={deadlineSummary.overdueCount}
        soonDeadlineCount={deadlineSummary.soonCount}
        isSaving={isSaving}
        headerAction={canEdit ? (
          <CreateTaskDialog
            projectId={projectId}
            storageProvider={storageProvider}
            existingLabels={allKnownLabels}
            availableTasks={createDialogAvailableTasks}
            availableEpics={availableEpicOptions}
            availableAssignees={availableAssignees}
            onTaskCreateStarted={insertOptimisticTask}
            onOptimisticTaskDiscard={(optimisticTaskId) => {
              if (optimisticTaskId) {
                removeLocalTask(optimisticTaskId);
              }
            }}
            onTaskCreated={(task, optimisticTaskId) => {
              const createdTask = mapTaskMutationResponseTask(task);
              if (optimisticTaskId) {
                replaceOptimisticTaskWithCreatedTask(
                  optimisticTaskId,
                  createdTask
                );
                return;
              }

              insertCreatedTask(createdTask);
            }}
          />
        ) : null}
        onToggleExpanded={() => setIsExpanded((previous) => !previous)}
      />

      {isExpanded && persistError ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {persistError}
        </div>
      ) : null}

      {isExpanded ? (
        <KanbanColumnsGrid
          canEdit={canEdit}
          columns={columns}
          archivedDoneTasks={archivedDoneTasks}
          mentionUsers={availableAssignees}
          highlightedTaskIds={highlightedTaskIds}
          onDragEnd={onDragEnd}
          onSelectTask={handleSelectTask}
          onEditTask={openTaskInEditMode}
          onTaskHoverChange={setHoveredTaskId}
        />
      ) : null}

      <TaskDetailModal
        projectId={projectId}
        canEdit={canEdit}
        isOpen={isClient && Boolean(selectedTask)}
        selectedTask={selectedTask}
        isEditMode={isEditMode}
        editTitle={editTitle}
        editLabels={editLabels}
        editLabelInput={editLabelInput}
        editLabelSuggestions={editLabelSuggestions}
        editDescription={editDescription}
        editDeadlineDate={editDeadlineDate}
        editEpicId={editEpicId}
        editAssigneeUserId={editAssigneeUserId}
        editRelatedTasks={editRelatedTasks}
        relatedTaskSearch={relatedTaskSearch}
        newBlockedFollowUpEntry={newBlockedFollowUpEntry}
        isUpdatingTask={isUpdatingTask}
        taskModalError={taskModalError}
        attachmentError={attachmentError}
        isSubmittingAttachment={isSubmittingAttachment}
        isArchivingTask={isArchivingTask}
        isArchivedTask={isSelectedTaskArchived}
        hasPendingAttachmentUploads={hasPendingAttachmentUploads}
        pendingAttachmentUploads={pendingAttachmentUploads}
        isLinkComposerOpen={isLinkComposerOpen}
        linkUrl={linkUrl}
        fileInputKey={fileInputKey}
        previewAttachment={previewAttachment}
        taskComments={taskComments}
        taskCommentsError={taskCommentsError}
        isLoadingTaskComments={isLoadingTaskComments}
        newTaskComment={newTaskComment}
        isSubmittingTaskComment={isSubmittingTaskComment}
        onClose={closeTaskModal}
        onActivateEditMode={handleActivateTaskEditMode}
        onToggleEditMode={handleToggleTaskEditMode}
        onEditTitleChange={setEditTitle}
        onEditLabelInputChange={setEditLabelInput}
        onAddEditLabel={addEditLabel}
        onRemoveEditLabel={removeEditLabel}
        onEditDescriptionChange={setEditDescription}
        onEditDeadlineDateChange={setEditDeadlineDate}
        onEditEpicIdChange={setEditEpicId}
        onEditAssigneeUserIdChange={setEditAssigneeUserId}
        onRelatedTaskSearchChange={setRelatedTaskSearch}
        onAddRelatedTask={addRelatedTask}
        onRemoveRelatedTask={removeRelatedTask}
        availableEpicOptions={availableEpicOptions}
        availableAssignees={availableAssignees}
        mentionUsers={availableAssignees}
        availableRelatedTaskOptions={availableRelatedTaskOptions}
        onOpenRelatedTask={openRelatedTask}
        onNewBlockedFollowUpEntryChange={setNewBlockedFollowUpEntry}
        onAddBlockedFollowUpEntry={handleAddBlockedFollowUpEntry}
        onSaveTask={handleTaskUpdate}
        onQuickEpicChange={handleQuickEpicUpdate}
        onQuickAssigneeChange={handleQuickAssigneeUpdate}
        onToggleLinkComposer={() =>
          setIsLinkComposerOpen((previous) => !previous)
        }
        onLinkUrlChange={setLinkUrl}
        onAddLinkAttachment={handleAddLinkAttachment}
        onAddFileAttachment={handleAddFileAttachment}
        onDeleteAttachment={handleDeleteAttachment}
        onPreviewAttachmentChange={setPreviewAttachment}
        onNewTaskCommentChange={setNewTaskComment}
        onSubmitTaskComment={handleSubmitTaskComment}
        onMoveTask={(nextStatus) => {
          if (!selectedTask) {
            return;
          }
          handleMoveTaskToStatus(selectedTask, nextStatus);
        }}
        onArchiveTask={handleArchiveTask}
        onUnarchiveTask={handleUnarchiveTask}
        onRequestDeleteTask={() => {
          if (!canEdit) {
            return;
          }
          if (!selectedTask) {
            return;
          }
          setPendingDeleteTask(selectedTask);
          closeTaskModal();
        }}
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
