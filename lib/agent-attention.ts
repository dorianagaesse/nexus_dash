export const AGENT_ATTENTION_EVENT_TYPES = ["mention", "assignment"] as const;
export type AgentAttentionEventType = (typeof AGENT_ATTENTION_EVENT_TYPES)[number];

export const AGENT_ATTENTION_ARTIFACT_TYPES = [
  "task",
  "task_comment",
  "meeting_todo",
] as const;
export type AgentAttentionArtifactType =
  (typeof AGENT_ATTENTION_ARTIFACT_TYPES)[number];

export const AGENT_ATTENTION_ASSIGNMENT_STATES = ["active", "completed"] as const;
export type AgentAttentionAssignmentState =
  (typeof AGENT_ATTENTION_ASSIGNMENT_STATES)[number];

export const AGENT_ATTENTION_ORDERS = ["asc", "desc"] as const;
export type AgentAttentionOrder = (typeof AGENT_ATTENTION_ORDERS)[number];

export const AGENT_ATTENTION_DEFAULT_LIMIT = 50;
export const AGENT_ATTENTION_MAX_LIMIT = 100;

export const AGENT_ATTENTION_INVALID_FILTER_ERROR = "agent-attention-invalid-filter";
export const AGENT_ATTENTION_INVALID_CURSOR_ERROR = "agent-attention-invalid-cursor";

// Stable per-artifact item keys: polling clients deduplicate by these across
// pages and across `since` windows, so they must never be re-derived from
// mutable fields.
export function buildAgentMentionEventItemId(mentionId: string): string {
  return `mention:${mentionId}`;
}

export function buildAgentTaskAssignmentItemId(taskId: string): string {
  return `assignment:task:${taskId}`;
}

export function buildAgentMeetingTodoAssignmentItemId(actionId: string): string {
  return `assignment:meeting_todo:${actionId}`;
}

export interface AgentAttentionSortKey {
  occurredAt: Date | null;
  id: string;
}

export interface AgentAttentionCursor extends AgentAttentionSortKey {
  order: AgentAttentionOrder;
}

const AGENT_ATTENTION_CURSOR_VERSION = 1;

export function encodeAgentAttentionCursor(cursor: AgentAttentionCursor): string {
  return Buffer.from(
    JSON.stringify({
      v: AGENT_ATTENTION_CURSOR_VERSION,
      o: cursor.order,
      t: cursor.occurredAt ? cursor.occurredAt.toISOString() : null,
      id: cursor.id,
    }),
    "utf8"
  ).toString("base64url");
}

export function decodeAgentAttentionCursor(
  value: string | null | undefined
): AgentAttentionCursor | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(value.trim(), "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  if (record.v !== AGENT_ATTENTION_CURSOR_VERSION) {
    return null;
  }

  if (record.o !== "asc" && record.o !== "desc") {
    return null;
  }

  if (typeof record.id !== "string" || record.id.length === 0) {
    return null;
  }

  let occurredAt: Date | null = null;
  if (record.t !== null) {
    if (typeof record.t !== "string") {
      return null;
    }
    const parsedOccurredAt = new Date(record.t);
    if (Number.isNaN(parsedOccurredAt.getTime())) {
      return null;
    }
    occurredAt = parsedOccurredAt;
  }

  return { order: record.o, occurredAt, id: record.id };
}

// Missing occurrence times (assignments stored before provenance tracking)
// sort as oldest, mirroring the SQL NULL placement used by the list queries.
function compareOccurredAt(left: Date | null, right: Date | null): number {
  if (!left && !right) {
    return 0;
  }
  if (!left) {
    return -1;
  }
  if (!right) {
    return 1;
  }
  return left.getTime() - right.getTime();
}

export function compareAgentAttentionSortKeys(
  left: AgentAttentionSortKey,
  right: AgentAttentionSortKey,
  order: AgentAttentionOrder
): number {
  const timeDifference = compareOccurredAt(left.occurredAt, right.occurredAt);
  const orderedDifference =
    order === "desc" ? -timeDifference : timeDifference;
  if (orderedDifference !== 0) {
    return orderedDifference;
  }

  const idDifference =
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  return order === "desc" ? -idDifference : idDifference;
}

export function isAgentAttentionItemAfterCursor(
  item: AgentAttentionSortKey,
  cursor: AgentAttentionCursor,
  order: AgentAttentionOrder
): boolean {
  if (cursor.order !== order) {
    return false;
  }

  return (
    compareAgentAttentionSortKeys(
      item,
      { occurredAt: cursor.occurredAt, id: cursor.id },
      order
    ) > 0
  );
}

export interface AgentAttentionListFilters {
  eventType: AgentAttentionEventType | null;
  artifactType: AgentAttentionArtifactType | null;
  state: AgentAttentionAssignmentState | null;
  since: Date | null;
  until: Date | null;
  limit: number;
  order: AgentAttentionOrder;
  cursor: AgentAttentionCursor | null;
}

export interface AgentAttentionFiltersResponse {
  eventType: AgentAttentionEventType | null;
  artifactType: AgentAttentionArtifactType | null;
  state: AgentAttentionAssignmentState | null;
  since: string | null;
  until: string | null;
  limit: number;
  order: AgentAttentionOrder;
  cursor: string | null;
}

export function mapAgentAttentionFiltersToResponse(input: {
  filters: AgentAttentionListFilters;
  rawCursor: string | null;
}): AgentAttentionFiltersResponse {
  return {
    eventType: input.filters.eventType,
    artifactType: input.filters.artifactType,
    state: input.filters.state,
    since: input.filters.since ? input.filters.since.toISOString() : null,
    until: input.filters.until ? input.filters.until.toISOString() : null,
    limit: input.filters.limit,
    order: input.filters.order,
    cursor: input.rawCursor,
  };
}

export type AgentAttentionFiltersParseResult =
  | { ok: true; filters: AgentAttentionListFilters }
  | { ok: false; error: string };

function readTrimmedParam(
  searchParams: URLSearchParams,
  key: string
): string | null {
  const rawValue = searchParams.get(key);
  if (rawValue === null) {
    return null;
  }

  const trimmedValue = rawValue.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function parseOccurredAtBound(value: string | null): Date | null | undefined {
  if (value === null) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed;
}

function parseLimit(value: string | null): number | null {
  if (value === null) {
    return AGENT_ATTENTION_DEFAULT_LIMIT;
  }

  if (!/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > AGENT_ATTENTION_MAX_LIMIT) {
    return null;
  }

  return parsed;
}

export function parseAgentAttentionListFilters(input: {
  searchParams: URLSearchParams;
  allowedEventTypes: readonly AgentAttentionEventType[];
  allowedArtifactTypes: readonly AgentAttentionArtifactType[];
  allowedStates: readonly AgentAttentionAssignmentState[];
}): AgentAttentionFiltersParseResult {
  const { searchParams } = input;

  const eventTypeValue = readTrimmedParam(searchParams, "eventType");
  if (
    eventTypeValue &&
    !(input.allowedEventTypes as readonly string[]).includes(eventTypeValue)
  ) {
    return { ok: false, error: AGENT_ATTENTION_INVALID_FILTER_ERROR };
  }

  const artifactTypeValue = readTrimmedParam(searchParams, "artifactType");
  if (
    artifactTypeValue &&
    !(input.allowedArtifactTypes as readonly string[]).includes(artifactTypeValue)
  ) {
    return { ok: false, error: AGENT_ATTENTION_INVALID_FILTER_ERROR };
  }

  const stateValue = readTrimmedParam(searchParams, "state");
  if (
    stateValue &&
    !(input.allowedStates as readonly string[]).includes(stateValue)
  ) {
    return { ok: false, error: AGENT_ATTENTION_INVALID_FILTER_ERROR };
  }

  const since = parseOccurredAtBound(readTrimmedParam(searchParams, "since"));
  if (since === undefined) {
    return { ok: false, error: AGENT_ATTENTION_INVALID_FILTER_ERROR };
  }

  const until = parseOccurredAtBound(readTrimmedParam(searchParams, "until"));
  if (until === undefined) {
    return { ok: false, error: AGENT_ATTENTION_INVALID_FILTER_ERROR };
  }

  if (since && until && since.getTime() > until.getTime()) {
    return { ok: false, error: AGENT_ATTENTION_INVALID_FILTER_ERROR };
  }

  const limit = parseLimit(readTrimmedParam(searchParams, "limit"));
  if (limit === null) {
    return { ok: false, error: AGENT_ATTENTION_INVALID_FILTER_ERROR };
  }

  const orderValue = readTrimmedParam(searchParams, "order") ?? "desc";
  if (orderValue !== "asc" && orderValue !== "desc") {
    return { ok: false, error: AGENT_ATTENTION_INVALID_FILTER_ERROR };
  }

  const cursorValue = readTrimmedParam(searchParams, "cursor");
  let cursor: AgentAttentionCursor | null = null;
  if (cursorValue) {
    cursor = decodeAgentAttentionCursor(cursorValue);
    if (!cursor) {
      return { ok: false, error: AGENT_ATTENTION_INVALID_CURSOR_ERROR };
    }
    if (cursor.order !== orderValue) {
      return { ok: false, error: AGENT_ATTENTION_INVALID_CURSOR_ERROR };
    }
  }

  return {
    ok: true,
    filters: {
      eventType: (eventTypeValue as AgentAttentionEventType | null) ?? null,
      artifactType: (artifactTypeValue as AgentAttentionArtifactType | null) ?? null,
      state: (stateValue as AgentAttentionAssignmentState | null) ?? null,
      since,
      until,
      limit,
      order: orderValue,
      cursor,
    },
  };
}
