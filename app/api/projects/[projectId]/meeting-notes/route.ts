import { NextRequest, NextResponse } from "next/server";

import {
  getAgentProjectAccessContext,
  requireApiPrincipal,
  requireAuthenticatedApiUser,
} from "@/lib/auth/api-guard";
import { logServerWarning } from "@/lib/observability/logger";
import { recordProjectActivityEventVersion } from "@/lib/project-activity-event-response";
import { withProjectActivityVersionHeader } from "@/lib/project-activity-version";
import type { ProjectMeetingParticipantInput } from "@/lib/meeting-participant";
import { isMeetingTodoActorReference } from "@/lib/meeting-todo-actor";
import {
  createProjectMeetingNote,
  listProjectMeetingNotes,
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

function readStewardFilter(
  value: string | null
): "all" | "mine" | "unassigned" {
  if (value === "mine" || value === "unassigned") {
    return value;
  }
  return "all";
}

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ projectId: string }> }
) {
  const params = await props.params;
  const principalResult = await requireApiPrincipal(request);
  if (!principalResult.ok) {
    return principalResult.response;
  }
  const principal = principalResult.principal;

  const query = request.nextUrl.searchParams.get("q");
  const stewardFilter = readStewardFilter(
    request.nextUrl.searchParams.get("steward")
  );
  const notes = await listProjectMeetingNotes({
    actorUserId: principal.actorUserId,
    projectId: params.projectId,
    query,
    stewardFilter,
    agentAccess: getAgentProjectAccessContext(principal),
  });

  return NextResponse.json({
    notes: notes.map((note) => serializeMeetingNote(note)),
  });
}

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ projectId: string }> }
) {
  const params = await props.params;
  const authenticatedUser = await requireAuthenticatedApiUser(request);
  if (!authenticatedUser.ok) {
    return authenticatedUser.response;
  }

  const payload = await readJsonPayload(
    request,
    "POST /api/projects/:projectId/meeting-notes.invalidJson"
  );
  if (payload instanceof NextResponse) {
    return payload;
  }

  const result = await createProjectMeetingNote({
    actorUserId: authenticatedUser.userId,
    projectId: params.projectId,
    title: readString(payload.title),
    scheduledAt: readOptionalString(payload.scheduledAt),
    participants: readParticipants(payload.participants),
    labels: readStringArray(payload.labels),
    status: readOptionalString(payload.status),
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
    action: "created",
    entityId: result.data.note.id,
    payload: { noteId: result.data.note.id },
  });

  return NextResponse.json(
    { note: serializeMeetingNote(result.data.note) },
    {
      status: 201,
      headers: withProjectActivityVersionHeader(new Headers(), version),
    }
  );
}
