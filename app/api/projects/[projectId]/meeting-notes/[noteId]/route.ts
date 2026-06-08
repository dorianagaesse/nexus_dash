import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedApiUser } from "@/lib/auth/api-guard";
import { logServerWarning } from "@/lib/observability/logger";
import { recordProjectActivityEventVersion } from "@/lib/project-activity-event-response";
import { withProjectActivityVersionHeader } from "@/lib/project-activity-version";
import {
  deleteProjectMeetingNote,
  updateProjectMeetingNote,
  type MeetingNoteActionInput,
  type ProjectMeetingNoteSummary,
} from "@/lib/services/project-meeting-note-service";

interface MeetingNoteRequestBody {
  title?: unknown;
  scheduledAt?: unknown;
  participants?: unknown;
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

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ projectId: string; noteId: string }> }
) {
  const params = await props.params;
  const authenticatedUser = await requireAuthenticatedApiUser(request);
  if (!authenticatedUser.ok) {
    return authenticatedUser.response;
  }

  const payload = await readJsonPayload(
    request,
    "PATCH /api/projects/:projectId/meeting-notes/:noteId.invalidJson"
  );
  if (payload instanceof NextResponse) {
    return payload;
  }

  const result = await updateProjectMeetingNote({
    actorUserId: authenticatedUser.userId,
    projectId: params.projectId,
    noteId: params.noteId,
    title: readString(payload.title),
    scheduledAt: readOptionalString(payload.scheduledAt),
    participants: readStringArray(payload.participants),
    inputNotes: readString(payload.inputNotes),
    outputNotes: readString(payload.outputNotes),
    decisions: readString(payload.decisions),
    actions: readActions(payload.actions),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const version = await recordProjectActivityEventVersion({
    actorUserId: authenticatedUser.userId,
    projectId: params.projectId,
    domain: "meeting-note",
    action: "updated",
    entityId: result.data.note.id,
    payload: { noteId: result.data.note.id },
  });

  return NextResponse.json(
    { note: serializeMeetingNote(result.data.note) },
    {
      headers: withProjectActivityVersionHeader(new Headers(), version),
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
