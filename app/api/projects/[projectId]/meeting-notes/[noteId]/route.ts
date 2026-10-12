import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedApiUser } from "@/lib/auth/api-guard";
import { logServerWarning } from "@/lib/observability/logger";
import { startServerTiming } from "@/lib/observability/server-timing";
import { recordProjectActivityEventVersion } from "@/lib/project-activity-event-response";
import { withProjectActivityVersionHeader } from "@/lib/project-activity-version";
import { contentErrorBody, parseContentIfMatch, withContentEtag, readContentIfMatch } from "@/lib/content-revision";
import type { ProjectMeetingParticipantInput } from "@/lib/meeting-participant";
import { isMeetingTodoActorReference } from "@/lib/meeting-todo-actor";
import {
  deleteProjectMeetingNote,
  getProjectMeetingNote,
  updateProjectMeetingNote,
  type MeetingNoteActionInput,
  type ProjectMeetingNoteSummary,
} from "@/lib/services/project-meeting-note-service";

interface MeetingNoteRequestBody {
  title?: unknown;
  scheduledAt?: unknown;
  participants?: unknown;
  labels?: unknown;
  status?: unknown;
  inputNotes?: unknown;
  outputNotes?: unknown;
  decisions?: unknown;
  actions?: unknown;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readOptionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
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

function readActions(value: unknown): MeetingNoteActionInput[] {
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

function serializeMeetingNote(note: ProjectMeetingNoteSummary) {
  return {
    ...note,
    scheduledAt: note.scheduledAt?.toISOString() ?? null,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
    actions: note.actions.map((action) => ({
      ...action,
      completedAt: action.completedAt?.toISOString() ?? null,
      assignedAt: action.assignedAt?.toISOString() ?? null,
    })),
  };
}

async function readJsonPayload(
  request: NextRequest,
  routeLabel: string
): Promise<MeetingNoteRequestBody | NextResponse> {
  try {
    return (await request.json()) as MeetingNoteRequestBody;
  } catch (error) {
    logServerWarning(routeLabel, "Invalid JSON payload", { error });
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }
}

export async function GET(request: NextRequest, props: { params: Promise<{ projectId: string; noteId: string }> }) {
  const params = await props.params;
  const user = await requireAuthenticatedApiUser(request);
  if (!user.ok) return user.response;
  const result = await getProjectMeetingNote({ ...params, actorUserId: user.userId });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ note: serializeMeetingNote(result.data.note) }, { headers: withContentEtag({}, "meeting-note", result.data.note) });
}

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ projectId: string; noteId: string }> }
) {
  const timing = startServerTiming("meeting-note.update");
  const params = await props.params;
  const authenticatedUser = await requireAuthenticatedApiUser(request);
  if (!authenticatedUser.ok) {
    return authenticatedUser.response;
  }
  const precondition = parseContentIfMatch(readContentIfMatch(request.headers), "meeting-note", params.noteId);
  if (!precondition.ok) return NextResponse.json({ error: precondition.error }, { status: 400 });

  const payload = await readJsonPayload(
    request,
    "PATCH /api/projects/:projectId/meeting-notes/:noteId.invalidJson"
  );
  if (payload instanceof NextResponse) {
    return payload;
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
    [payload.participants, payload.labels, payload.actions].some((value) => value !== undefined && !Array.isArray(value)) ||
    [payload.title, payload.inputNotes, payload.outputNotes, payload.decisions].some((value) => value !== undefined && typeof value !== "string")) {
    return NextResponse.json({ error: "invalid-request-body" }, { status: 400 });
  }

  const result = await updateProjectMeetingNote({
    actorUserId: authenticatedUser.userId,
    projectId: params.projectId,
    noteId: params.noteId,
    ...(payload.title === undefined ? {} : { title: readString(payload.title) }),
    ...(payload.scheduledAt === undefined ? {} : { scheduledAt: readOptionalString(payload.scheduledAt) }),
    ...(payload.participants === undefined ? {} : { participants: readParticipants(payload.participants) }),
    ...(payload.labels === undefined ? {} : { labels: readStringArray(payload.labels) }),
    ...(payload.status === undefined ? {} : { status: readOptionalString(payload.status) }),
    ...(payload.inputNotes === undefined ? {} : { inputNotes: readString(payload.inputNotes) }),
    ...(payload.outputNotes === undefined ? {} : { outputNotes: readString(payload.outputNotes) }),
    ...(payload.decisions === undefined ? {} : { decisions: readString(payload.decisions) }),
    ...(payload.actions === undefined ? {} : { actions: readActions(payload.actions) }),
    ...(precondition.expectedRevision === undefined ? {} : { expectedRevision: precondition.expectedRevision }),
  });

  if (!result.ok) {
    return NextResponse.json(
      contentErrorBody(result),
      { status: result.status, headers: result.current ? withContentEtag(timing.headers(), "meeting-note", result.current) : timing.headers() }
    );
  }

  return NextResponse.json(
    { note: serializeMeetingNote(result.data.note) },
    {
      headers: withContentEtag(withProjectActivityVersionHeader(
        timing.headers(),
        result.data.activityVersion
      ), "meeting-note", result.data.note),
    }
  );
}

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ projectId: string; noteId: string }> }
) {
  const params = await props.params;
  const authenticatedUser = await requireAuthenticatedApiUser(request);
  if (!authenticatedUser.ok) {
    return authenticatedUser.response;
  }

  const result = await deleteProjectMeetingNote({
    actorUserId: authenticatedUser.userId,
    projectId: params.projectId,
    noteId: params.noteId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const version = await recordProjectActivityEventVersion({
    actorUserId: authenticatedUser.userId,
    projectId: params.projectId,
    domain: "meeting-note",
    action: "deleted",
    entityId: params.noteId,
    payload: { noteId: params.noteId },
  });

  return NextResponse.json(
    { ok: true },
    {
      headers: withProjectActivityVersionHeader(new Headers(), version),
    }
  );
}
