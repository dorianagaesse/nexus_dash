import { prisma } from "@/lib/prisma";
import { sanitizeRichText } from "@/lib/rich-text";
import { parseTaskLabelsJson, serializeTaskLabels } from "@/lib/task-label";
import { isTaskStatus, TASK_STATUSES, type TaskStatus } from "@/lib/task-status";
import {
  parseAttachmentLinksJson,
  validateAttachmentFiles,
} from "@/lib/services/attachment-input-service";
import { createTaskAttachmentsFromDraft } from "@/lib/services/project-attachment-service";

const MIN_TITLE_LENGTH = 2;

interface ServiceErrorResult {
  ok: false;
  status: number;
  error: string;
}

interface ServiceSuccessResult<T> {
  ok: true;
  data: T;
}

type ServiceResult<T> = ServiceSuccessResult<T> | ServiceErrorResult;

export interface ReorderColumnPayload {
  status: string;
  taskIds: string[];
}

export interface ReorderPayload {
  columns: ReorderColumnPayload[];
}

export interface UpdateTaskPayload {
  title: string;
  label?: string;
  labels?: string[];
  description?: string;
  blockedFollowUpEntry?: string;
}

interface CreateTaskForProjectInput {
  projectId: string;
  title: string;
  description: string;
  labelsJsonRaw: string;
  attachmentLinksJsonRaw: string;
  attachmentFiles: File[];
}

interface UpdatedTaskPayload {
  id: string;
  title: string;
  label: string | null;
  labelsJson: string | null;
  description: string | null;
  blockedNote: string | null;
  status: string;
  position: number;
  blockedFollowUps: {
    id: string;
    content: string;
    createdAt: Date;
  }[];
}

function createError(status: number, error: string): ServiceErrorResult {
  return { ok: false, status, error };
}

function normalizeText(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

export function isValidReorderPayload(payload: unknown): payload is ReorderPayload {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const maybeColumns = (payload as ReorderPayload).columns;

  if (!Array.isArray(maybeColumns)) {
    return false;
  }

  const seenTaskIds = new Set<string>();

  return maybeColumns.every((column) => {
    if (!column || typeof column !== "object") {
      return false;
    }

    if (typeof column.status !== "string" || !isTaskStatus(column.status)) {
      return false;
    }

    if (!Array.isArray(column.taskIds)) {
      return false;
    }

    return column.taskIds.every((id) => {
      if (typeof id !== "string" || id.length === 0) {
        return false;
      }

      if (seenTaskIds.has(id)) {
        return false;
      }

      seenTaskIds.add(id);
      return true;
    });
  });
}

export async function createTaskForProject(
  input: CreateTaskForProjectInput
): Promise<ServiceResult<{ id: string }>> {
  const title = normalizeText(input.title);
  if (title.length < MIN_TITLE_LENGTH) {
    return createError(400, "title-too-short");
  }

  const parsedLinks = parseAttachmentLinksJson(input.attachmentLinksJsonRaw);
  if (parsedLinks.error) {
    return createError(400, parsedLinks.error);
  }

  const attachmentFileError = validateAttachmentFiles(input.attachmentFiles);
  if (attachmentFileError) {
    return createError(400, attachmentFileError);
  }

  const labels = parseTaskLabelsJson(input.labelsJsonRaw);
  const serializedLabels = serializeTaskLabels(labels);
  const description = sanitizeRichText(normalizeText(input.description));
  const status = TASK_STATUSES[0];

  let createdTaskId: string | null = null;

  try {
    const project = await prisma.project.findUnique({
      where: { id: input.projectId },
      select: { id: true },
    });

    if (!project) {
      return createError(404, "project-not-found");
    }

    const maxPosition = await prisma.task.aggregate({
      where: { projectId: input.projectId, status },
      _max: { position: true },
    });

    const nextPosition = (maxPosition._max.position ?? -1) + 1;

    const createdTask = await prisma.task.create({
      data: {
        projectId: input.projectId,
        title,
        description,
        label: labels[0] ?? null,
        labelsJson: serializedLabels,
        status,
        position: nextPosition,
      },
      select: { id: true },
    });

    createdTaskId = createdTask.id;

    await createTaskAttachmentsFromDraft({
      taskId: createdTask.id,
      links: parsedLinks.links,
      files: input.attachmentFiles,
    });

    return {
      ok: true,
      data: {
        id: createdTask.id,
      },
    };
  } catch (error) {
    if (createdTaskId) {
      await prisma.task
        .delete({
          where: { id: createdTaskId },
        })
        .catch((cleanupError) => {
          console.error("[createTaskForProject.cleanup]", cleanupError);
        });
    }

    console.error("[createTaskForProject]", error);
    return createError(500, "create-failed");
  }
}

export async function reorderProjectTasks(
  projectId: string,
  payload: ReorderPayload
): Promise<ServiceResult<{ ok: true }>> {
  const normalizedColumns = TASK_STATUSES.map((status) => {
    const matchingColumn = payload.columns.find((column) => column.status === status);
    return {
      status,
      taskIds: matchingColumn ? matchingColumn.taskIds : [],
    };
  });

  const taskIds = normalizedColumns.flatMap((column) => column.taskIds);

  if (taskIds.length === 0) {
    return {
      ok: true,
      data: { ok: true },
    };
  }

  try {
    const tasks = await prisma.task.findMany({
      where: {
        projectId,
        id: { in: taskIds },
      },
      select: { id: true, status: true, completedAt: true },
    });

    if (tasks.length !== taskIds.length) {
      return createError(400, "One or more tasks do not belong to this project");
    }

    const taskById = new Map(tasks.map((task) => [task.id, task]));

    const updateOperations = normalizedColumns.flatMap(
      (column: { status: TaskStatus; taskIds: string[] }) =>
        column.taskIds.map((taskId, index) => {
          const existingTask = taskById.get(taskId);
          const movedToDone =
            column.status === "Done" && existingTask?.status !== "Done";

          return prisma.task.update({
            where: { id: taskId },
            data: {
              status: column.status,
              position: index,
              archivedAt: null,
              completedAt:
                column.status === "Done"
                  ? movedToDone
                    ? new Date()
                    : existingTask?.completedAt ?? new Date()
                  : null,
            },
          });
        })
    );

    await prisma.$transaction(updateOperations);

    return {
      ok: true,
      data: { ok: true },
    };
  } catch (error) {
    console.error("[reorderProjectTasks]", error);
    return createError(500, "Failed to persist task order");
  }
}

export async function updateTaskForProject(
  projectId: string,
  taskId: string,
  payload: UpdateTaskPayload
): Promise<ServiceResult<{ task: UpdatedTaskPayload }>> {
  const title = normalizeText(payload.title);
  const rawLabels =
    Array.isArray(payload.labels) && payload.labels.length > 0
      ? payload.labels
      : [normalizeText(payload.label)];
  const labels = rawLabels.map((entry) => normalizeText(entry)).filter(Boolean);
  const normalizedLabels = parseTaskLabelsJson(JSON.stringify(labels));
  const serializedLabels = serializeTaskLabels(normalizedLabels);
  const description = sanitizeRichText(normalizeText(payload.description));
  const blockedFollowUpEntry = normalizeText(payload.blockedFollowUpEntry);

  if (title.length < MIN_TITLE_LENGTH) {
    return createError(400, "Task title must be at least 2 characters");
  }

  try {
    const existingTask = await prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, projectId: true, status: true, position: true },
    });

    if (!existingTask || existingTask.projectId !== projectId) {
      return createError(404, "Task not found");
    }

    const updatedTask = await prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: { id: taskId },
        data: {
          title,
          label: normalizedLabels[0] ?? null,
          labelsJson: serializedLabels,
          description,
        },
      });

      if (blockedFollowUpEntry.length > 0 && existingTask.status === "Blocked") {
        await tx.taskBlockedFollowUp.create({
          data: {
            taskId,
            content: blockedFollowUpEntry,
          },
        });
      }

      return tx.task.findUnique({
        where: { id: taskId },
        select: {
          id: true,
          title: true,
          label: true,
          labelsJson: true,
          description: true,
          blockedNote: true,
          status: true,
          position: true,
          blockedFollowUps: {
            orderBy: [{ createdAt: "desc" }],
            select: {
              id: true,
              content: true,
              createdAt: true,
            },
          },
        },
      });
    });

    if (!updatedTask) {
      return createError(404, "Task not found");
    }

    return {
      ok: true,
      data: {
        task: updatedTask,
      },
    };
  } catch (error) {
    console.error("[updateTaskForProject]", error);
    return createError(500, "Failed to update task");
  }
}
