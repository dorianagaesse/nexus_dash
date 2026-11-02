import type { ProjectMeetingParticipantInput } from "@/lib/meeting-participant";
import {
  isMeetingTodoActorReference,
  type MeetingTodoActorReference,
} from "@/lib/meeting-todo-actor";

type MeetingNoteActionCommand = {
  id: string | null;
  content: string;
  completedAt: string | null;
  assignee: MeetingTodoActorReference | null | undefined;
};

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readOptionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readOptionalVisibility(
  value: unknown
): { ok: true; value: "private" | "team" | undefined } | { ok: false } {
  if (value === undefined || value === null) {
    return { ok: true, value: undefined };
  }
  if (typeof value !== "string") {
    return { ok: false };
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "") {
    return { ok: true, value: undefined };
  }
  if (normalized === "private") {
    return { ok: true, value: "private" };
  }
  if (normalized === "team" || normalized === "public") {
    return { ok: true, value: "team" };
  }
  return { ok: false };
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string");
}

function readParticipants(value: unknown): ProjectMeetingParticipantInput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (typeof entry === "string") {
      return [{ userId: null, displayName: entry }];
    }
    if (!entry || typeof entry !== "object") {
      return [];
    }

    const record = entry as Record<string, unknown>;
    return [
      {
        userId:
          typeof record.userId === "string" ? record.userId : null,
        displayName: readString(record.displayName),
      },
    ];
  });
}

function readActions(value: unknown): MeetingNoteActionCommand[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }

    const record = entry as Record<string, unknown>;
    return [
      {
        id: readOptionalString(record.id),
        content: readString(record.content),
        completedAt: readOptionalString(record.completedAt),
        assignee:
          record.assignee === null
            ? null
            : isMeetingTodoActorReference(record.assignee)
              ? { kind: record.assignee.kind, id: record.assignee.id.trim() }
              : undefined,
      },
    ];
  });
}

function isRequestObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function contractError(error: "invalid-request-body" | "meeting-note-visibility-invalid") {
  return { ok: false as const, status: 400 as const, error };
}

// Transport coercion only. Services retain rich-content normalization, business
// validation, project authorization and persistence for every caller.
function parseMeetingNoteFields(payload: Record<string, unknown>) {
  const visibility = readOptionalVisibility(payload.visibility);
  if (!visibility.ok) {
    return contractError("meeting-note-visibility-invalid");
  }

  return {
    ok: true as const,
    data: {
      title: readString(payload.title),
      scheduledAt: readOptionalString(payload.scheduledAt),
      participants: readParticipants(payload.participants),
      labels: readStringArray(payload.labels),
      status: readOptionalString(payload.status),
      ...(visibility.value === undefined ? {} : { visibility: visibility.value }),
      inputNotes: readString(payload.inputNotes),
      outputNotes: readString(payload.outputNotes),
      decisions: readString(payload.decisions),
      actions: readActions(payload.actions),
    },
  };
}

/** Create retains its existing field defaults after checking the JSON object boundary. */
export function parseCreateMeetingNoteInput(input: unknown) {
  if (!isRequestObject(input)) {
    return contractError("invalid-request-body");
  }
  return parseMeetingNoteFields(input);
}

export type CreateMeetingNoteCommand = Extract<
  ReturnType<typeof parseCreateMeetingNoteInput>,
  { ok: true }
>["data"];

/** PATCH preserves presence separately from the shared field coercions. */
export function parseUpdateMeetingNoteInput(input: unknown) {
  if (
    !isRequestObject(input) ||
    [input.participants, input.labels, input.actions].some(
      (value) => value !== undefined && !Array.isArray(value)
    ) ||
    [input.title, input.inputNotes, input.outputNotes, input.decisions].some(
      (value) => value !== undefined && typeof value !== "string"
    )
  ) {
    return contractError("invalid-request-body");
  }

  const parsed = parseMeetingNoteFields(input);
  if (!parsed.ok) {
    return parsed;
  }

  // Removing keys cannot change their parsed types. Check undefined rather
  // than truthiness so empty strings/arrays and explicit nulls remain writes.
  const data = Object.fromEntries(
    Object.entries(parsed.data).filter(([field]) => input[field] !== undefined)
  ) as Partial<CreateMeetingNoteCommand>;
  return { ok: true as const, data };
}

export type UpdateMeetingNoteCommand = Extract<
  ReturnType<typeof parseUpdateMeetingNoteInput>,
  { ok: true }
>["data"];
