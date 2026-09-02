import { NextRequest, NextResponse } from "next/server";

import {
  getAgentProjectAccessContext,
  requireApiPrincipal,
} from "@/lib/auth/api-guard";
import { logServerWarning } from "@/lib/observability/logger";
import { isMeetingTodoActorReference } from "@/lib/meeting-todo-actor";
import { recordProjectActivityEventVersion } from "@/lib/project-activity-event-response";
import { withProjectActivityVersionHeader } from "@/lib/project-activity-version";
import {
  setProjectMeetingNoteSteward,
  type ProjectMeetingNoteSummary,
} from "@/lib/services/project-meeting-note-service";

interface StewardRequestBody {
  steward?: unknown;
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
): Promise<unknown | NextResponse> {
  try {
    return (await request.json()) as StewardRequestBody;
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
  const principalResult = await requireApiPrincipal(request);
  if (!principalResult.ok) {
    return principalResult.response;
  }
  const principal = principalResult.principal;

  const payload = await readJsonPayload(
    request,
    "PATCH /api/projects/:projectId/meeting-notes/:noteId/steward.invalidJson"
  );
  if (payload instanceof NextResponse) {
    return payload;
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return NextResponse.json(
      { error: "meeting-note-steward-required" },
      { status: 400 }
    );
  }

  const stewardPayload = payload as StewardRequestBody;

  let steward: Parameters<typeof setProjectMeetingNoteSteward>[0]["steward"];
  if (stewardPayload.steward === null) {
    steward = null;
  } else if (isMeetingTodoActorReference(stewardPayload.steward)) {
    steward = {
      kind: stewardPayload.steward.kind,
      id: stewardPayload.steward.id.trim(),
    };
  } else if (stewardPayload.steward === undefined) {
    return NextResponse.json(
      { error: "meeting-note-steward-required" },
      { status: 400 }
    );
  } else {
    return NextResponse.json(
      { error: "meeting-note-steward-invalid" },
      { status: 400 }
    );
  }

  const result = await setProjectMeetingNoteSteward({
    actorUserId: principal.actorUserId,
    projectId: params.projectId,
    noteId: params.noteId,
    steward,
    agentAccess: getAgentProjectAccessContext(principal),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const version = await recordProjectActivityEventVersion({
    actorUserId: principal.actorUserId,
    projectId: params.projectId,
    domain: "meeting-note",
    action: "updated",
    entityId: result.data.note.id,
    payload: {
      noteId: result.data.note.id,
      steward: steward
        ? { kind: steward.kind, id: steward.id }
        : null,
    },
  });

  return NextResponse.json(
    { note: serializeMeetingNote(result.data.note) },
    {
      headers: withProjectActivityVersionHeader(new Headers(), version),
    }
  );
}
