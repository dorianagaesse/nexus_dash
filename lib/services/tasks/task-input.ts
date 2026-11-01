import { normalizeRelatedTaskIds } from "@/lib/task-related";
import { isTaskStatus } from "@/lib/task-status";
import { parseTaskDeadlineDate } from "@/lib/task-deadline";
import { isProjectActorReference, type ProjectActorReference } from "@/lib/project-actor";
import type {
  ServiceResult,
  ReorderPayload,
  TaskStatusTransitionPayload,
} from "./task-types";
import { createError } from "./task-result";

export const MIN_TITLE_LENGTH = 2;

export const TASK_ASSIGNEE_INVALID = "assignee-invalid";

export function normalizeText(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

export function serializeJsonFieldValue(value: unknown): string {
  if (value == null) {
    return "";
  }
  if (typeof value === "string") {
    return value.trim();
  }
  return JSON.stringify(value);
}

export function parseDeadlineInput(
  value: unknown,
  options?: { preserveWhenMissing?: boolean }
): ServiceResult<{ provided: boolean; deadlineAt: Date | null }> {
  if (value === undefined) {
    if (options?.preserveWhenMissing === true) {
      return {
        ok: true,
        data: {
          provided: false,
          deadlineAt: null,
        },
      };
    }

    return {
      ok: true,
      data: {
        provided: true,
        deadlineAt: null,
      },
    };
  }

  if (value === null) {
    return {
      ok: true,
      data: {
        provided: true,
        deadlineAt: null,
      },
    };
  }

  if (typeof value !== "string") {
    return createError(400, "deadline-invalid");
  }

  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return {
      ok: true,
      data: {
        provided: true,
        deadlineAt: null,
      },
    };
  }

  const parsedDeadline = parseTaskDeadlineDate(normalizedValue);
  if (!parsedDeadline) {
    return createError(400, "deadline-invalid");
  }

  return {
    ok: true,
    data: {
      provided: true,
      deadlineAt: parsedDeadline,
    },
  };
}

export function validateTaskCreateFieldTypes(payload: {
  deadlineDate?: unknown;
  epicId?: unknown;
  assigneeUserId?: unknown;
  assignee?: unknown;
}): string | null {
  if (
    payload.deadlineDate !== undefined &&
    payload.deadlineDate !== null &&
    typeof payload.deadlineDate !== "string"
  ) {
    return "deadline-invalid";
  }
  if (
    payload.epicId !== undefined &&
    payload.epicId !== null &&
    typeof payload.epicId !== "string"
  ) {
    return "epic-invalid";
  }
  if (
    payload.assigneeUserId !== undefined &&
    payload.assigneeUserId !== null &&
    typeof payload.assigneeUserId !== "string"
  ) {
    return TASK_ASSIGNEE_INVALID;
  }
  if (
    payload.assignee !== undefined &&
    payload.assignee !== null &&
    !isProjectActorReference(payload.assignee)
  ) {
    return TASK_ASSIGNEE_INVALID;
  }
  return null;
}

// Create transports may send the structured assignee reference (which wins)
// or the legacy human shorthand; callers reject malformed shape through
// validateTaskCreateFieldTypes before calling this. An explicit structured
// null means "no assignee" and suppresses the legacy fallback, matching the
// update transport's precedence.
export function parseTaskAssigneeInput(payload: {
  assignee?: unknown;
  assigneeUserId?: unknown;
}): ProjectActorReference | null {
  if (payload.assignee === null) {
    return null;
  }

  if (payload.assignee === undefined) {
    if (typeof payload.assigneeUserId === "string") {
      const legacyAssigneeUserId = payload.assigneeUserId.trim();
      return legacyAssigneeUserId
        ? { kind: "human", id: legacyAssigneeUserId }
        : null;
    }
    return null;
  }

  if (isProjectActorReference(payload.assignee)) {
    return {
      kind: payload.assignee.kind,
      id: payload.assignee.id.trim(),
    };
  }

  return null;
}

export function parseRelatedTaskIdsJson(rawValue: string): string[] | null {
  const trimmedValue = rawValue.trim();
  if (!trimmedValue) {
    return [];
  }

  try {
    const parsedValue = JSON.parse(trimmedValue) as unknown;
    if (!Array.isArray(parsedValue)) {
      return null;
    }

    return normalizeRelatedTaskIds(parsedValue);
  } catch {
    return null;
  }
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

export function isTaskStatusTransitionPayload(
  payload: unknown
): payload is TaskStatusTransitionPayload {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const candidate = payload as TaskStatusTransitionPayload;
  if (!isTaskStatus(candidate.status)) {
    return false;
  }

  if (
    candidate.position !== undefined &&
    (!Number.isInteger(candidate.position) || candidate.position < 0)
  ) {
    return false;
  }

  return true;
}
