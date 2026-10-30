import {
  isProjectActorReference,
  PROJECT_ACTOR_KINDS,
  type ProjectActorReference,
} from "@/lib/project-actor";
import { sanitizeRichText } from "@/lib/rich-text";
import {
  parseAttachmentLinksInput,
  validateAttachmentFiles,
  type AttachmentInputErrorCode,
  type ParsedAttachmentLink,
} from "@/lib/task-attachment";
import { MAX_BULK_TASK_OPERATIONS } from "@/lib/task-bulk";
import { parseTaskDeadlineDate } from "@/lib/task-deadline";
import {
  MAX_TASK_LABEL_LENGTH,
  MAX_TASK_LABELS,
  normalizeTaskLabels,
  parseTaskLabelsJson,
  serializeTaskLabels,
} from "@/lib/task-label";
import { normalizeRelatedTaskIds } from "@/lib/task-related";
import { isTaskStatus, TASK_STATUSES, type TaskStatus } from "@/lib/task-status";
import {
  MAX_TASK_TITLE_LENGTH,
  MIN_TASK_TITLE_LENGTH,
} from "@/lib/task-title";

export const TASK_ASSIGNEE_INVALID_ERROR = "assignee-invalid";

export const TASK_CREATE_FIELD_NAMES = [
  "title",
  "description",
  "deadlineDate",
  "epicId",
  "assignee",
  "assigneeUserId",
  "labels",
  "relatedTaskIds",
  "attachmentLinks",
] as const;

export const TASK_MULTIPART_CREATE_FIELD_NAMES = [
  "title",
  "description",
  "deadlineDate",
  "epicId",
  "assigneeKind",
  "assigneeId",
  "assigneeUserId",
  "labels",
  "relatedTaskIds",
  "attachmentLinks",
  "attachmentFiles",
] as const;

export const TASK_UPDATE_FIELD_NAMES = [
  "title",
  "label",
  "labels",
  "description",
  "deadlineDate",
  "epicId",
  "assignee",
  "assigneeUserId",
  "blockedFollowUpEntry",
  "relatedTaskIds",
  "addRelatedTaskIds",
  "removeRelatedTaskIds",
  "attachmentLinks",
] as const;

export const TASK_STATUS_TRANSITION_FIELD_NAMES = [
  "status",
  "position",
] as const;

export const TASK_REORDER_FIELD_NAMES = ["columns"] as const;

export const TASK_BULK_OPERATION_TYPES = [
  "create",
  "update",
  "status",
] as const;

export type TaskBulkOperationType = (typeof TASK_BULK_OPERATION_TYPES)[number];

export interface BulkCreateOperation {
  type: "create";
  task: {
    title?: unknown;
    description?: unknown;
    deadlineDate?: unknown;
    epicId?: unknown;
    assignee?: unknown;
    assigneeUserId?: unknown;
    label?: unknown;
    labels?: unknown;
    relatedTaskIds?: unknown;
    attachmentLinks?: unknown;
  };
}

export interface BulkUpdateOperation {
  type: "update";
  taskId: string;
  changes: UpdateTaskPayload;
}

export interface BulkStatusOperation {
  type: "status";
  taskId: string;
  status: TaskStatusTransitionPayload["status"];
  position?: number;
}

export type BulkOperation =
  | BulkCreateOperation
  | BulkUpdateOperation
  | BulkStatusOperation;

export interface TaskBulkRequestPayload {
  operations: BulkOperation[];
}

export interface InvalidRelatedTaskDiagnostic {
  id: string;
  reason: "archived" | "missing" | "cross-project" | "self";
}

export interface TaskContractErrorResult {
  ok: false;
  status: 400;
  error: string;
  invalidRelatedTask?: InvalidRelatedTaskDiagnostic;
}

export interface TaskContractSuccessResult<T> {
  ok: true;
  data: T;
}

export type TaskContractParseResult<T> =
  | TaskContractSuccessResult<T>
  | TaskContractErrorResult;

export interface TaskRuntimeSchema<TInput, TOutput = TInput> {
  readonly name: string;
  readonly fields: readonly string[];
  parse(input: unknown): TaskContractParseResult<TOutput>;
  is(input: unknown): input is TInput;
}

export type InferTaskContractInput<
  TSchema extends TaskRuntimeSchema<unknown, unknown>,
> = TSchema extends TaskRuntimeSchema<infer TInput, unknown> ? TInput : never;

export type InferTaskContractOutput<
  TSchema extends TaskRuntimeSchema<unknown, unknown>,
> = TSchema extends TaskRuntimeSchema<unknown, infer TOutput> ? TOutput : never;

export interface TaskAttachmentLinkInputShape {
  name?: string;
  url: string;
}

export interface TaskCreateInputShape {
  title: string;
  description?: string | null;
  deadlineDate?: string | null;
  epicId?: string | null;
  assignee?: ProjectActorReference | null;
  assigneeUserId?: string | null;
  label?: string | null;
  labels?: string[] | string | null;
  relatedTaskIds?: string[] | string | null;
  attachmentLinks?: TaskAttachmentLinkInputShape[] | string | null;
  attachmentFiles?: File[];
}

export interface CreateTaskLegacyFields {
  title: string;
  description: string;
  deadlineDate: string;
  epicId: string | null;
  assignee: ProjectActorReference | null;
  labelsJsonRaw: string;
  relatedTaskIdsJsonRaw: string;
  attachmentLinksJsonRaw: string;
  attachmentFiles: File[];
}

export interface CreateTaskCommand extends CreateTaskLegacyFields {
  readonly __contract: "CreateTaskCommand";
  normalizedDescription: string | null;
  deadlineAt: Date | null;
  labels: string[];
  serializedLabels: string | null;
  relatedTaskIds: string[];
  attachmentLinks: ParsedAttachmentLink[];
}

export interface UpdateTaskPayload {
  title?: string;
  label?: string;
  labels?: string[];
  description?: string;
  deadlineDate?: string | null;
  blockedFollowUpEntry?: string;
  relatedTaskIds?: string[];
  addRelatedTaskIds?: string[];
  removeRelatedTaskIds?: string[];
  epicId?: string | null;
  assignee?: ProjectActorReference | null;
  assigneeUserId?: string | null;
  attachmentLinks?: unknown;
}

export type TaskRelatedTasksUpdateMode =
  | { mode: "preserve" }
  | { mode: "replace"; relatedTaskIds: string[] }
  | {
      mode: "patch";
      addRelatedTaskIds: string[];
      removeRelatedTaskIds: string[];
    };

export interface UpdateTaskCommand {
  readonly __contract: "UpdateTaskCommand";
  title?: string;
  labels?: {
    labels: string[];
    serializedLabels: string | null;
  };
  description?: string | null;
  deadline?: {
    deadlineDate: string | null;
    deadlineAt: Date | null;
  };
  blockedFollowUpEntry?: string;
  relatedTasks: TaskRelatedTasksUpdateMode;
  epicId?: string | null;
  assignee?: ProjectActorReference | null;
  attachmentLinks?: ParsedAttachmentLink[];
}

export interface ReorderColumnPayload {
  status: string;
  taskIds: string[];
}

export interface ReorderPayload {
  columns: ReorderColumnPayload[];
}

export interface TaskStatusTransitionPayload {
  status: TaskStatus;
  position?: number;
}

function createContractError(
  error: string,
  invalidRelatedTask?: InvalidRelatedTaskDiagnostic
): TaskContractErrorResult {
  return {
    ok: false,
    status: 400,
    error,
    ...(invalidRelatedTask ? { invalidRelatedTask } : {}),
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(record: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function normalizeText(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function serializeJsonField(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value);
}

function getFormStringValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== "string") {
    return "";
  }
  return value;
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
    return TASK_ASSIGNEE_INVALID_ERROR;
  }
  if (
    payload.assignee !== undefined &&
    payload.assignee !== null &&
    !isProjectActorReference(payload.assignee)
  ) {
    return TASK_ASSIGNEE_INVALID_ERROR;
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

export function parseMultipartTaskAssigneeInput(formData: FormData): {
  assignee: ProjectActorReference | null;
  invalid: boolean;
} {
  const assigneeKind = getFormStringValue(formData, "assigneeKind").trim();
  const assigneeId = getFormStringValue(formData, "assigneeId").trim();
  const legacyAssigneeUserId = getFormStringValue(
    formData,
    "assigneeUserId"
  ).trim();

  if (!assigneeKind && !assigneeId) {
    return {
      assignee: legacyAssigneeUserId
        ? { kind: "human", id: legacyAssigneeUserId }
        : null,
      invalid: false,
    };
  }

  const candidate = { kind: assigneeKind, id: assigneeId };
  if (!isProjectActorReference(candidate)) {
    return { assignee: null, invalid: true };
  }

  return { assignee: candidate, invalid: false };
}

export function parseTaskDeadlineInput(
  value: unknown,
  options?: { preserveWhenMissing?: boolean }
): TaskContractParseResult<{
  provided: boolean;
  deadlineDate: string | null;
  deadlineAt: Date | null;
}> {
  if (value === undefined) {
    if (options?.preserveWhenMissing === true) {
      return {
        ok: true,
        data: {
          provided: false,
          deadlineDate: null,
          deadlineAt: null,
        },
      };
    }

    return {
      ok: true,
      data: {
        provided: true,
        deadlineDate: null,
        deadlineAt: null,
      },
    };
  }

  if (value === null) {
    return {
      ok: true,
      data: {
        provided: true,
        deadlineDate: null,
        deadlineAt: null,
      },
    };
  }

  if (typeof value !== "string") {
    return createContractError("deadline-invalid");
  }

  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return {
      ok: true,
      data: {
        provided: true,
        deadlineDate: null,
        deadlineAt: null,
      },
    };
  }

  const parsedDeadline = parseTaskDeadlineDate(normalizedValue);
  if (!parsedDeadline) {
    return createContractError("deadline-invalid");
  }

  return {
    ok: true,
    data: {
      provided: true,
      deadlineDate: normalizedValue,
      deadlineAt: parsedDeadline,
    },
  };
}

function parseCreateRelatedTaskIdsInput(rawValue: unknown): string[] | null {
  if (rawValue === undefined || rawValue === null) {
    return [];
  }

  if (Array.isArray(rawValue)) {
    return normalizeRelatedTaskIds(rawValue);
  }

  if (typeof rawValue !== "string") {
    return null;
  }

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

export function parseTaskLabelsInput(input: {
  labels?: unknown;
  label?: unknown;
}): {
  labels: string[];
  serializedLabels: string | null;
} {
  if (typeof input.labels === "string") {
    const labels = parseTaskLabelsJson(input.labels);
    return {
      labels,
      serializedLabels: serializeTaskLabels(labels),
    };
  }

  if (Array.isArray(input.labels) && input.labels.length > 0) {
    const stringLabels = input.labels
      .map((entry) => normalizeText(entry))
      .filter(Boolean);
    const normalized = normalizeTaskLabels(stringLabels);
    return {
      labels: normalized,
      serializedLabels: serializeTaskLabels(normalized),
    };
  }

  const fallbackLabel = normalizeText(input.label);
  const normalized = fallbackLabel ? normalizeTaskLabels([fallbackLabel]) : [];
  return {
    labels: normalized,
    serializedLabels: serializeTaskLabels(normalized),
  };
}

export function isCreateTaskCommand(value: unknown): value is CreateTaskCommand {
  return (
    isPlainRecord(value) &&
    value.__contract === "CreateTaskCommand" &&
    typeof value.title === "string" &&
    Array.isArray(value.labels) &&
    Array.isArray(value.relatedTaskIds) &&
    Array.isArray(value.attachmentLinks) &&
    Array.isArray(value.attachmentFiles)
  );
}

export function isUpdateTaskCommand(value: unknown): value is UpdateTaskCommand {
  return (
    isPlainRecord(value) &&
    value.__contract === "UpdateTaskCommand" &&
    isPlainRecord(value.relatedTasks) &&
    typeof value.relatedTasks.mode === "string"
  );
}

interface RawCreateTaskContractFields {
  title: unknown;
  description?: unknown;
  deadlineDate?: unknown;
  epicId?: unknown;
  assignee: ProjectActorReference | null;
  label?: unknown;
  labels?: unknown;
  labelsJsonRaw?: string;
  relatedTaskIds?: unknown;
  relatedTaskIdsJsonRaw?: string;
  attachmentLinks?: unknown;
  attachmentLinksJsonRaw?: string;
  attachmentFiles?: File[];
}

function buildCreateTaskCommand(
  raw: RawCreateTaskContractFields
): TaskContractParseResult<CreateTaskCommand> {
  const rawTitle = typeof raw.title === "string" ? raw.title : "";
  const title = rawTitle.trim();
  if (title.length < MIN_TASK_TITLE_LENGTH) {
    return createContractError("title-too-short");
  }
  if (title.length > MAX_TASK_TITLE_LENGTH) {
    return createContractError("title-too-long");
  }

  const attachmentLinksInput =
    raw.attachmentLinks !== undefined
      ? raw.attachmentLinks
      : (raw.attachmentLinksJsonRaw ?? "");
  const parsedLinks = parseAttachmentLinksInput(attachmentLinksInput);
  if (parsedLinks.error) {
    return createContractError(parsedLinks.error);
  }

  const relatedTaskIdsInput =
    raw.relatedTaskIds !== undefined
      ? raw.relatedTaskIds
      : (raw.relatedTaskIdsJsonRaw ?? "");
  const parsedRelatedTaskIds = parseCreateRelatedTaskIdsInput(
    relatedTaskIdsInput
  );
  if (parsedRelatedTaskIds === null) {
    return createContractError("related-tasks-invalid");
  }

  const attachmentFiles = raw.attachmentFiles ?? [];
  const attachmentFileError: AttachmentInputErrorCode | null =
    validateAttachmentFiles(attachmentFiles);
  if (attachmentFileError) {
    return createContractError(attachmentFileError);
  }

  const labelsInput =
    raw.labels !== undefined ? raw.labels : (raw.labelsJsonRaw ?? "");
  const parsedLabels = parseTaskLabelsInput({
    labels: labelsInput,
    label: raw.label,
  });

  const rawDescription =
    typeof raw.description === "string" ? raw.description : "";
  const normalizedDescription = sanitizeRichText(rawDescription.trim());

  const deadlineResult = parseTaskDeadlineInput(raw.deadlineDate, {
    preserveWhenMissing: false,
  });
  if (!deadlineResult.ok) {
    return deadlineResult;
  }

  const rawEpicId =
    typeof raw.epicId === "string" ? raw.epicId.trim() || null : null;

  const labelsJsonRaw =
    raw.labelsJsonRaw !== undefined
      ? raw.labelsJsonRaw
      : serializeJsonField(raw.labels);
  const relatedTaskIdsJsonRaw =
    raw.relatedTaskIdsJsonRaw !== undefined
      ? raw.relatedTaskIdsJsonRaw
      : serializeJsonField(raw.relatedTaskIds);
  const attachmentLinksJsonRaw =
    raw.attachmentLinksJsonRaw !== undefined
      ? raw.attachmentLinksJsonRaw
      : serializeJsonField(raw.attachmentLinks);

  return {
    ok: true,
    data: {
      __contract: "CreateTaskCommand",
      title,
      description: rawDescription.trim(),
      normalizedDescription,
      deadlineDate: deadlineResult.data.deadlineDate ?? "",
      deadlineAt: deadlineResult.data.deadlineAt,
      epicId: rawEpicId,
      assignee: raw.assignee,
      labels: parsedLabels.labels,
      serializedLabels: parsedLabels.serializedLabels,
      labelsJsonRaw,
      relatedTaskIds: parsedRelatedTaskIds,
      relatedTaskIdsJsonRaw,
      attachmentLinks: parsedLinks.links,
      attachmentLinksJsonRaw,
      attachmentFiles,
    },
  };
}

export function parseCreateTaskJsonInput(
  payload: unknown
): TaskContractParseResult<CreateTaskCommand> {
  if (!isPlainRecord(payload)) {
    return createContractError("invalid-request-body");
  }

  const fieldTypeError = validateTaskCreateFieldTypes(payload);
  if (fieldTypeError) {
    return createContractError(fieldTypeError);
  }

  return buildCreateTaskCommand({
    title: payload.title,
    description: payload.description,
    deadlineDate: payload.deadlineDate,
    epicId: payload.epicId,
    assignee: parseTaskAssigneeInput(payload),
    label: payload.label,
    labels: payload.labels,
    relatedTaskIds: payload.relatedTaskIds,
    attachmentLinks: payload.attachmentLinks,
    attachmentFiles: [],
  });
}

export function parseCreateTaskMultipartInput(
  formData: FormData,
  options?: { isAgentRequest?: boolean }
): TaskContractParseResult<CreateTaskCommand> {
  const attachmentFiles = formData
    .getAll("attachmentFiles")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (options?.isAgentRequest && attachmentFiles.length > 0) {
    return createContractError("agent-file-attachments-not-supported");
  }

  const parsedAssignee = parseMultipartTaskAssigneeInput(formData);
  if (parsedAssignee.invalid) {
    return createContractError(TASK_ASSIGNEE_INVALID_ERROR);
  }

  const labelsRaw = getFormStringValue(formData, "labels").trim();
  const relatedTaskIdsRaw = getFormStringValue(
    formData,
    "relatedTaskIds"
  ).trim();
  const attachmentLinksRaw = getFormStringValue(
    formData,
    "attachmentLinks"
  ).trim();

  return buildCreateTaskCommand({
    title: getFormStringValue(formData, "title"),
    description: getFormStringValue(formData, "description"),
    deadlineDate: getFormStringValue(formData, "deadlineDate"),
    epicId: getFormStringValue(formData, "epicId").trim() || null,
    assignee: parsedAssignee.assignee,
    labels: labelsRaw,
    labelsJsonRaw: labelsRaw,
    relatedTaskIds: relatedTaskIdsRaw,
    relatedTaskIdsJsonRaw: relatedTaskIdsRaw,
    attachmentLinks: attachmentLinksRaw,
    attachmentLinksJsonRaw: attachmentLinksRaw,
    attachmentFiles,
  });
}

export function parseCreateTaskInput(
  input: CreateTaskCommand | CreateTaskLegacyFields | TaskCreateInputShape
): TaskContractParseResult<CreateTaskCommand> {
  if (isCreateTaskCommand(input)) {
    return { ok: true, data: input };
  }

  const fieldTypeError = validateTaskCreateFieldTypes(input);
  if (fieldTypeError) {
    return createContractError(fieldTypeError);
  }

  if ("labelsJsonRaw" in input) {
    return buildCreateTaskCommand({
      title: input.title,
      description: input.description,
      deadlineDate: input.deadlineDate,
      epicId: input.epicId,
      assignee: input.assignee,
      labelsJsonRaw: input.labelsJsonRaw,
      relatedTaskIdsJsonRaw: input.relatedTaskIdsJsonRaw,
      attachmentLinksJsonRaw: input.attachmentLinksJsonRaw,
      attachmentFiles: input.attachmentFiles,
    });
  }

  return buildCreateTaskCommand({
    title: input.title,
    description: input.description,
    deadlineDate: input.deadlineDate,
    epicId: input.epicId,
    assignee: parseTaskAssigneeInput(input),
    label: input.label,
    labels: input.labels,
    relatedTaskIds: input.relatedTaskIds,
    attachmentLinks: input.attachmentLinks,
    attachmentFiles: input.attachmentFiles ?? [],
  });
}

export function parseUpdateTaskJsonInput(
  payload: unknown,
  options?: { taskId?: string; validateTitleLength?: boolean }
): TaskContractParseResult<UpdateTaskCommand> {
  const attachedCommand =
    isPlainRecord(payload) && isUpdateTaskCommand(payload.__parsedUpdateCommand)
      ? payload.__parsedUpdateCommand
      : isUpdateTaskCommand(payload)
        ? payload
        : null;

  if (attachedCommand) {
    if (
      options?.taskId &&
      attachedCommand.relatedTasks.mode === "patch" &&
      attachedCommand.relatedTasks.removeRelatedTaskIds.includes(options.taskId)
    ) {
      return createContractError("related-tasks-invalid", {
        id: options.taskId,
        reason: "self",
      });
    }
    if (
      options?.validateTitleLength !== false &&
      attachedCommand.title !== undefined
    ) {
      if (attachedCommand.title.length < MIN_TASK_TITLE_LENGTH) {
        return createContractError("Task title must be at least 2 characters");
      }
      if (attachedCommand.title.length > MAX_TASK_TITLE_LENGTH) {
        return createContractError("title-too-long");
      }
    }
    return { ok: true, data: attachedCommand };
  }

  if (!isPlainRecord(payload)) {
    return createContractError("invalid-request-body");
  }

  const titleProvided = hasOwn(payload, "title");
  const title = normalizeText(payload.title);

  const labelsProvided = hasOwn(payload, "labels") || hasOwn(payload, "label");
  const parsedLabels = labelsProvided
    ? parseTaskLabelsInput({
        labels: payload.labels,
        label: payload.label,
      })
    : undefined;

  const descriptionProvided = hasOwn(payload, "description");
  const description = descriptionProvided
    ? sanitizeRichText(normalizeText(payload.description))
    : undefined;

  const deadlineResult = parseTaskDeadlineInput(payload.deadlineDate, {
    preserveWhenMissing: true,
  });
  if (!deadlineResult.ok) {
    return deadlineResult;
  }

  const blockedFollowUpEntry = normalizeText(payload.blockedFollowUpEntry);

  const relatedTaskIdsProvided = hasOwn(payload, "relatedTaskIds");
  const additiveRelationsProvided =
    hasOwn(payload, "addRelatedTaskIds") ||
    hasOwn(payload, "removeRelatedTaskIds");
  if (relatedTaskIdsProvided && additiveRelationsProvided) {
    return createContractError("related-tasks-mode-conflict");
  }

  for (const field of ["addRelatedTaskIds", "removeRelatedTaskIds"] as const) {
    if (
      hasOwn(payload, field) &&
      (!Array.isArray(payload[field]) ||
        payload[field].some(
          (id: unknown) => typeof id !== "string" || !id.trim()
        ))
    ) {
      return createContractError("related-tasks-invalid");
    }
  }

  if (
    relatedTaskIdsProvided &&
    payload.relatedTaskIds !== undefined &&
    payload.relatedTaskIds !== null &&
    (!Array.isArray(payload.relatedTaskIds) ||
      payload.relatedTaskIds.some((id: unknown) => typeof id !== "string"))
  ) {
    return createContractError("related-tasks-invalid");
  }

  const addRelatedTaskIds = normalizeRelatedTaskIds(
    (payload.addRelatedTaskIds as string[] | undefined) ?? []
  );
  const removeRelatedTaskIds = normalizeRelatedTaskIds(
    (payload.removeRelatedTaskIds as string[] | undefined) ?? []
  );
  if (addRelatedTaskIds.some((id) => removeRelatedTaskIds.includes(id))) {
    return createContractError("related-tasks-operation-conflict");
  }
  if (options?.taskId && removeRelatedTaskIds.includes(options.taskId)) {
    return createContractError("related-tasks-invalid", {
      id: options.taskId,
      reason: "self",
    });
  }

  const relatedTasks: TaskRelatedTasksUpdateMode = relatedTaskIdsProvided
    ? {
        mode: "replace",
        relatedTaskIds: normalizeRelatedTaskIds(
          (payload.relatedTaskIds as string[] | null | undefined) ?? []
        ),
      }
    : additiveRelationsProvided
      ? {
          mode: "patch",
          addRelatedTaskIds,
          removeRelatedTaskIds,
        }
      : { mode: "preserve" };

  const epicProvided = hasOwn(payload, "epicId");
  if (
    epicProvided &&
    payload.epicId !== undefined &&
    payload.epicId !== null &&
    typeof payload.epicId !== "string"
  ) {
    return createContractError("epic-invalid");
  }
  const epicId = epicProvided
    ? normalizeText(payload.epicId) || null
    : undefined;

  const assigneeReferenceProvided =
    hasOwn(payload, "assignee") && payload.assignee !== undefined;
  const legacyAssigneeProvided = hasOwn(payload, "assigneeUserId");
  let assignee: ProjectActorReference | null | undefined = undefined;
  if (assigneeReferenceProvided) {
    if (payload.assignee === null) {
      assignee = null;
    } else if (isProjectActorReference(payload.assignee)) {
      assignee = {
        kind: payload.assignee.kind,
        id: payload.assignee.id.trim(),
      };
    } else {
      return createContractError(TASK_ASSIGNEE_INVALID_ERROR);
    }
  } else if (legacyAssigneeProvided) {
    if (
      payload.assigneeUserId !== undefined &&
      payload.assigneeUserId !== null &&
      typeof payload.assigneeUserId !== "string"
    ) {
      return createContractError(TASK_ASSIGNEE_INVALID_ERROR);
    }
    const legacyAssigneeUserId = normalizeText(payload.assigneeUserId);
    assignee = legacyAssigneeUserId
      ? { kind: "human", id: legacyAssigneeUserId }
      : null;
  }
  const assigneeProvided = assigneeReferenceProvided || legacyAssigneeProvided;

  const attachmentLinksProvided = hasOwn(payload, "attachmentLinks");
  let attachmentLinks: ParsedAttachmentLink[] | undefined = undefined;
  if (attachmentLinksProvided) {
    const parsedLinks = parseAttachmentLinksInput(payload.attachmentLinks);
    if (parsedLinks.error) {
      return createContractError(parsedLinks.error);
    }
    attachmentLinks = parsedLinks.links;
  }

  if (options?.validateTitleLength !== false && titleProvided) {
    if (title.length < MIN_TASK_TITLE_LENGTH) {
      return createContractError("Task title must be at least 2 characters");
    }
    if (title.length > MAX_TASK_TITLE_LENGTH) {
      return createContractError("title-too-long");
    }
  }

  return {
    ok: true,
    data: {
      __contract: "UpdateTaskCommand",
      ...(titleProvided ? { title } : {}),
      ...(labelsProvided && parsedLabels ? { labels: parsedLabels } : {}),
      ...(descriptionProvided ? { description } : {}),
      ...(deadlineResult.data.provided
        ? {
            deadline: {
              deadlineDate: deadlineResult.data.deadlineDate,
              deadlineAt: deadlineResult.data.deadlineAt,
            },
          }
        : {}),
      ...(blockedFollowUpEntry ? { blockedFollowUpEntry } : {}),
      relatedTasks,
      ...(epicProvided ? { epicId } : {}),
      ...(assigneeProvided ? { assignee: assignee ?? null } : {}),
      ...(attachmentLinksProvided && attachmentLinks !== undefined
        ? { attachmentLinks }
        : {}),
    },
  };
}

export function toCreateTaskServiceInput<TAgentAccess = unknown>(
  command: CreateTaskCommand,
  context: {
    actorUserId: string;
    projectId: string;
    agentAccess?: TAgentAccess;
  }
): CreateTaskCommand & {
  actorUserId: string;
  projectId: string;
  agentAccess?: TAgentAccess;
} {
  const target = {
    actorUserId: context.actorUserId,
    projectId: context.projectId,
    title: command.title,
    description: command.description,
    deadlineDate: command.deadlineDate,
    epicId: command.epicId,
    assignee: command.assignee,
    labelsJsonRaw: command.labelsJsonRaw,
    relatedTaskIdsJsonRaw: command.relatedTaskIdsJsonRaw,
    attachmentLinksJsonRaw: command.attachmentLinksJsonRaw,
    attachmentFiles: command.attachmentFiles,
    agentAccess: context.agentAccess,
  };

  Object.defineProperties(target, {
    __contract: { value: "CreateTaskCommand", enumerable: false },
    normalizedDescription: {
      value: command.normalizedDescription,
      enumerable: false,
    },
    deadlineAt: { value: command.deadlineAt, enumerable: false },
    labels: { value: command.labels, enumerable: false },
    serializedLabels: { value: command.serializedLabels, enumerable: false },
    relatedTaskIds: { value: command.relatedTaskIds, enumerable: false },
    attachmentLinks: { value: command.attachmentLinks, enumerable: false },
  });

  return target as CreateTaskCommand & {
    actorUserId: string;
    projectId: string;
    agentAccess?: TAgentAccess;
  };
}

export function toUpdateTaskServiceInput(
  rawPayload: UpdateTaskPayload,
  command: UpdateTaskCommand
): UpdateTaskPayload & { readonly __parsedUpdateCommand?: UpdateTaskCommand } {
  const target = { ...rawPayload };
  Object.defineProperty(target, "__parsedUpdateCommand", {
    value: command,
    enumerable: false,
  });
  return target;
}

export function isBulkCreateOperation(
  operation: unknown
): operation is BulkCreateOperation {
  if (!isPlainRecord(operation) || operation.type !== "create") {
    return false;
  }
  const task = operation.task;
  return (
    isPlainRecord(task) &&
    typeof task.title === "string" &&
    task.title.trim().length > 0
  );
}

export function isBulkUpdateOperation(
  operation: unknown
): operation is BulkUpdateOperation {
  if (!isPlainRecord(operation) || operation.type !== "update") {
    return false;
  }
  return (
    typeof operation.taskId === "string" &&
    operation.taskId.trim().length > 0 &&
    isPlainRecord(operation.changes)
  );
}

export function isBulkStatusOperation(
  operation: unknown
): operation is BulkStatusOperation {
  if (!isPlainRecord(operation) || operation.type !== "status") {
    return false;
  }
  return (
    typeof operation.taskId === "string" &&
    operation.taskId.trim().length > 0 &&
    isTaskStatusTransitionPayload({
      status: operation.status,
      position: operation.position,
    })
  );
}

export function isValidBulkOperation(
  operation: unknown
): operation is BulkOperation {
  return (
    isBulkCreateOperation(operation) ||
    isBulkUpdateOperation(operation) ||
    isBulkStatusOperation(operation)
  );
}

export function parseBulkTaskOperations(body: unknown): BulkOperation[] | null {
  if (!isPlainRecord(body)) {
    return null;
  }

  const maybeOperations = body.operations;
  if (!Array.isArray(maybeOperations) || maybeOperations.length === 0) {
    return null;
  }

  if (maybeOperations.length > MAX_BULK_TASK_OPERATIONS) {
    return null;
  }

  return maybeOperations.every(isValidBulkOperation)
    ? (maybeOperations as BulkOperation[])
    : null;
}

export const taskBulkRequestContract: TaskRuntimeSchema<
  TaskBulkRequestPayload,
  TaskBulkRequestPayload
> = {
  name: "TaskBulkRequest",
  fields: ["operations"] as const,
  parse(input: unknown) {
    const operations = parseBulkTaskOperations(input);
    if (!operations) {
      return createContractError("Invalid payload");
    }
    return { ok: true, data: { operations } };
  },
  is(input: unknown): input is TaskBulkRequestPayload {
    return parseBulkTaskOperations(input) !== null;
  },
};

export function isValidReorderPayload(
  payload: unknown
): payload is ReorderPayload {
  if (!isPlainRecord(payload)) {
    return false;
  }

  const maybeColumns = payload.columns;

  if (!Array.isArray(maybeColumns)) {
    return false;
  }

  const seenTaskIds = new Set<string>();

  return maybeColumns.every((column) => {
    if (!isPlainRecord(column)) {
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
  if (!isPlainRecord(payload)) {
    return false;
  }

  if (typeof payload.status !== "string" || !isTaskStatus(payload.status)) {
    return false;
  }

  if (
    payload.position !== undefined &&
    (!Number.isInteger(payload.position) || (payload.position as number) < 0)
  ) {
    return false;
  }

  return true;
}

export const taskCreateContract: TaskRuntimeSchema<
  TaskCreateInputShape,
  CreateTaskCommand
> = {
  name: "TaskCreateRequest",
  fields: TASK_CREATE_FIELD_NAMES,
  parse: (input: unknown) => parseCreateTaskJsonInput(input),
  is: (input: unknown): input is TaskCreateInputShape =>
    parseCreateTaskJsonInput(input).ok,
};

export const taskUpdateContract: TaskRuntimeSchema<
  UpdateTaskPayload,
  UpdateTaskCommand
> = {
  name: "TaskUpdateRequest",
  fields: TASK_UPDATE_FIELD_NAMES,
  parse: (input: unknown) => parseUpdateTaskJsonInput(input),
  is: (input: unknown): input is UpdateTaskPayload =>
    parseUpdateTaskJsonInput(input).ok,
};

export const taskStatusTransitionContract: TaskRuntimeSchema<
  TaskStatusTransitionPayload,
  TaskStatusTransitionPayload
> = {
  name: "TaskStatusTransitionRequest",
  fields: TASK_STATUS_TRANSITION_FIELD_NAMES,
  parse(input: unknown) {
    if (!isTaskStatusTransitionPayload(input)) {
      return createContractError("Invalid payload");
    }
    return {
      ok: true,
      data: {
        status: input.status,
        ...(input.position !== undefined ? { position: input.position } : {}),
      },
    };
  },
  is: isTaskStatusTransitionPayload,
};

export const taskReorderContract: TaskRuntimeSchema<
  ReorderPayload,
  ReorderPayload
> = {
  name: "TaskReorderRequest",
  fields: TASK_REORDER_FIELD_NAMES,
  parse(input: unknown) {
    if (!isValidReorderPayload(input)) {
      return createContractError("Invalid payload");
    }
    return { ok: true, data: input };
  },
  is: isValidReorderPayload,
};

export type TaskCreateContractInput = InferTaskContractInput<
  typeof taskCreateContract
>;
export type TaskCreateContractOutput = InferTaskContractOutput<
  typeof taskCreateContract
>;
export type TaskUpdateContractInput = InferTaskContractInput<
  typeof taskUpdateContract
>;
export type TaskUpdateContractOutput = InferTaskContractOutput<
  typeof taskUpdateContract
>;

export function buildProjectActorReferenceInputOpenApiSchema() {
  return {
    type: "object",
    required: ["kind", "id"],
    additionalProperties: false,
    properties: {
      kind: { type: "string", enum: PROJECT_ACTOR_KINDS },
      id: { type: "string" },
    },
  } as const;
}

export function buildTaskCreateRequestOpenApiProperties(options?: {
  includeAssigneeDescription?: boolean;
}) {
  return {
    title: {
      type: "string",
      minLength: MIN_TASK_TITLE_LENGTH,
      maxLength: MAX_TASK_TITLE_LENGTH,
    },
    description: { type: "string" },
    deadlineDate: { type: "string", format: "date" },
    epicId: { type: ["string", "null"] },
    assignee: {
      anyOf: [
        { $ref: "#/components/schemas/ProjectActorReferenceInput" },
        { type: "null" },
      ],
      ...(options?.includeAssigneeDescription !== false
        ? {
            description:
              "Assign a project member (kind human) or an active agent credential (kind agent). Revoked, expired, or non-member actors are rejected with assignee-invalid.",
          }
        : {}),
    },
    assigneeUserId: {
      type: ["string", "null"],
      deprecated: true,
      description:
        "Legacy human-only assignee shorthand. Prefer assignee; when both are present, assignee wins.",
    },
    labels: {
      type: "array",
      maxItems: MAX_TASK_LABELS,
      items: {
        type: "string",
        maxLength: MAX_TASK_LABEL_LENGTH,
      },
    },
    relatedTaskIds: {
      type: "array",
      items: {
        type: "string",
      },
    },
    attachmentLinks: {
      type: "array",
      items: {
        $ref: "#/components/schemas/AttachmentLinkInput",
      },
    },
  } as const;
}

export function buildTaskCreateRequestOpenApiSchema(options?: {
  includeAssigneeDescription?: boolean;
}) {
  return {
    type: "object",
    required: ["title"],
    properties: buildTaskCreateRequestOpenApiProperties(options),
  } as const;
}

export function buildTaskUpdateRequestOpenApiProperties() {
  return {
    title: {
      type: "string",
      minLength: MIN_TASK_TITLE_LENGTH,
      maxLength: MAX_TASK_TITLE_LENGTH,
      description:
        "Replace the title. When provided it must be at least 2 characters.",
    },
    label: {
      type: "string",
      maxLength: MAX_TASK_LABEL_LENGTH,
      deprecated: true,
      description:
        "Legacy singular label input. Prefer labels; when provided it replaces the full label set.",
    },
    labels: {
      type: "array",
      maxItems: MAX_TASK_LABELS,
      items: { type: "string", maxLength: MAX_TASK_LABEL_LENGTH },
      description:
        "Replace the full label set with this array. An empty array clears all labels.",
    },
    description: {
      type: "string",
      description: "Replace the rich-text description.",
    },
    deadlineDate: {
      type: ["string", "null"],
      format: "date",
      description:
        "Replace the deadline using YYYY-MM-DD. Omit to preserve; null clears the deadline.",
    },
    epicId: {
      type: ["string", "null"],
      description: "Replace the epic link. Omit to preserve; null clears it.",
    },
    assignee: {
      anyOf: [
        { $ref: "#/components/schemas/ProjectActorReferenceInput" },
        { type: "null" },
      ],
      description:
        "Replace the assignee with a project member or active agent credential. Omit to preserve; null clears the assignment. Reassignments and unassignments append to the task assignment history.",
    },
    assigneeUserId: {
      type: ["string", "null"],
      deprecated: true,
      description:
        "Legacy human-only assignee shorthand. Prefer assignee; when both are present, assignee wins. Omit to preserve; null clears the assignment.",
    },
    blockedFollowUpEntry: {
      type: "string",
      description:
        "Append an entry to the blocked follow-up timeline when the task is Blocked.",
    },
    relatedTaskIds: {
      type: "array",
      items: { type: "string" },
      description:
        "Replace the related-task set. Omit to preserve; an empty array removes all relations. Cannot be combined with addRelatedTaskIds or removeRelatedTaskIds.",
    },
    addRelatedTaskIds: {
      type: "array",
      items: { type: "string", minLength: 1 },
      description:
        "Add only these undirected relation pairs, preserving all other relations. IDs must identify active tasks in this project, or already-linked archived tasks. Existing pairs are retained without duplication. Cannot be combined with relatedTaskIds or overlap removeRelatedTaskIds. Blank IDs and self-relations are invalid.",
    },
    removeRelatedTaskIds: {
      type: "array",
      items: { type: "string", minLength: 1 },
      description:
        "Remove only these undirected relation pairs, preserving all other relations. Absent pairs are a no-op; archived, missing, or inaccessible target IDs need no lookup. Cannot be combined with relatedTaskIds or overlap addRelatedTaskIds. Blank IDs and self-relations are invalid.",
    },
    attachmentLinks: {
      type: "array",
      items: { $ref: "#/components/schemas/AttachmentLinkInput" },
      description:
        "Append link attachments to the task. Each entry creates a new link attachment and existing attachments are preserved; an empty array appends nothing. Remove attachments with DELETE /api/projects/{projectId}/tasks/{taskId}/attachments/{attachmentId}.",
    },
  } as const;
}

export function buildTaskUpdateRequestOpenApiSchema() {
  return {
    type: "object",
    description:
      "True partial update: every field is optional and only the fields present in the request body change. Omitted fields are preserved.",
    allOf: [
      { not: { required: ["relatedTaskIds", "addRelatedTaskIds"] } },
      { not: { required: ["relatedTaskIds", "removeRelatedTaskIds"] } },
    ],
    properties: buildTaskUpdateRequestOpenApiProperties(),
  } as const;
}

export function buildTaskReorderRequestOpenApiSchema() {
  return {
    type: "object",
    required: ["columns"],
    properties: {
      columns: {
        type: "array",
        items: {
          type: "object",
          required: ["status", "taskIds"],
          properties: {
            status: {
              type: "string",
              enum: TASK_STATUSES,
            },
            taskIds: {
              type: "array",
              items: {
                type: "string",
              },
            },
          },
        },
      },
    },
  } as const;
}

export function buildTaskStatusTransitionRequestOpenApiSchema() {
  return {
    type: "object",
    required: ["status"],
    properties: {
      status: {
        type: "string",
        enum: TASK_STATUSES,
      },
      position: {
        type: "integer",
        minimum: 0,
        description:
          "0-based index inside the destination column. Omit to append at the end of the destination column; when the task stays in its current column, omit to keep its current position.",
      },
    },
  } as const;
}

export function buildTaskBulkOpenApiSchemas() {
  return {
    TaskBulkRequest: {
      type: "object",
      required: ["operations"],
      properties: {
        operations: {
          type: "array",
          minItems: 1,
          maxItems: MAX_BULK_TASK_OPERATIONS,
          items: {
            oneOf: [
              { $ref: "#/components/schemas/TaskBulkCreateOperation" },
              { $ref: "#/components/schemas/TaskBulkUpdateOperation" },
              { $ref: "#/components/schemas/TaskBulkStatusOperation" },
            ],
          },
        },
      },
    },
    TaskBulkCreateOperation: {
      type: "object",
      required: ["type", "task"],
      properties: {
        type: {
          type: "string",
          enum: ["create"],
        },
        task: buildTaskCreateRequestOpenApiSchema({
          includeAssigneeDescription: false,
        }),
      },
    },
    TaskBulkUpdateOperation: {
      type: "object",
      required: ["type", "taskId", "changes"],
      properties: {
        type: {
          type: "string",
          enum: ["update"],
        },
        taskId: { type: "string" },
        changes: {
          $ref: "#/components/schemas/TaskUpdateRequest",
        },
      },
    },
    TaskBulkStatusOperation: {
      type: "object",
      required: ["type", "taskId", "status"],
      properties: {
        type: {
          type: "string",
          enum: ["status"],
        },
        taskId: { type: "string" },
        status: {
          type: "string",
          enum: TASK_STATUSES,
        },
        position: {
          type: "integer",
          minimum: 0,
          description:
            "0-based index inside the destination column. Omit to append at the end.",
        },
      },
    },
  } as const;
}
