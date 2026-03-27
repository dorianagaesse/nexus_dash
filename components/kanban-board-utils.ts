import type { DraggableProvidedDraggableProps } from "@hello-pangea/dnd";

import { richTextToPreviewText } from "@/lib/rich-text";
import { ATTACHMENT_KIND_FILE, ATTACHMENT_KIND_LINK } from "@/lib/task-attachment";
import { TASK_STATUSES, type TaskStatus } from "@/lib/task-status";

export type TaskColumns<T> = Record<TaskStatus, T[]>;

function truncatePreviewText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  const softLimit = value.slice(0, maxLength - 3).trimEnd();
  const lastWordBoundary = softLimit.lastIndexOf(" ");

  if (lastWordBoundary >= Math.floor(maxLength * 0.6)) {
    return `${softLimit.slice(0, lastWordBoundary)}...`;
  }

  return `${softLimit}...`;
}

export function getDescriptionPreview(description: string, maxLength = 140): string {
  const previewText = richTextToPreviewText(description);

  if (previewText.length <= maxLength) {
    return previewText;
  }

  return truncatePreviewText(previewText, maxLength);
}

export function resolveAttachmentHref(attachment: {
  kind: string;
  downloadUrl: string | null;
  url: string | null;
}): string | null {
  if (attachment.kind === ATTACHMENT_KIND_FILE) {
    return attachment.downloadUrl;
  }

  if (attachment.kind === ATTACHMENT_KIND_LINK) {
    return attachment.url;
  }

  return null;
}

export function formatFollowUpTimestamp(value: string): string {
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }
  return parsedDate.toLocaleDateString();
}

export async function readApiError(
  response: Response,
  fallbackMessage: string
): Promise<string> {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  return payload?.error ?? fallbackMessage;
}

export function createEmptyColumns<T>(): TaskColumns<T> {
  return {
    Backlog: [],
    "In Progress": [],
    Blocked: [],
    Done: [],
  };
}

export function mapTasksToColumns<T extends { status: TaskStatus }>(
  tasks: T[]
): TaskColumns<T> {
  const columns = createEmptyColumns<T>();

  tasks.forEach((task) => {
    columns[task.status].push(task);
  });

  return columns;
}

export function cloneColumns<T>(columns: TaskColumns<T>): TaskColumns<T> {
  return {
    Backlog: [...columns.Backlog],
    "In Progress": [...columns["In Progress"]],
    Blocked: [...columns.Blocked],
    Done: [...columns.Done],
  };
}

export function buildDragStyle(
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

export function buildPersistPayload<T extends { id: string }>(columns: TaskColumns<T>) {
  return {
    columns: TASK_STATUSES.map((status) => ({
      status,
      taskIds: columns[status].map((task) => task.id),
    })),
  };
}
