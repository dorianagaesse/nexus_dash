import { NextRequest, NextResponse } from "next/server";

import {
  getAgentProjectAccessContext,
  requireApiPrincipal,
} from "@/lib/auth/api-guard";
import { logServerWarning } from "@/lib/observability/logger";
import { startServerTiming } from "@/lib/observability/server-timing";
import { withProjectActivityVersionHeader } from "@/lib/project-activity-version";
import { parseCreateMeetingNoteInput } from "@/lib/meeting-note-contracts";
import {
  createProjectMeetingNote,
  listProjectMeetingNotes,
  type ProjectMeetingNoteSummary,
} from "@/lib/services/project-meeting-note-service";

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
): Promise<unknown> {
  try {
    return await request.json();
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
  const timing = startServerTiming("meeting-note.create");
  const params = await props.params;
  const authenticatedUser = await requireApiPrincipal(request);
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

  const parsed = parseCreateMeetingNoteInput(payload);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  const result = await createProjectMeetingNote({
    agentAccess: getAgentProjectAccessContext(authenticatedUser.principal),
    actorUserId: authenticatedUser.principal.actorUserId,
    projectId: params.projectId,
    ...parsed.data,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status, headers: timing.headers() }
    );
  }

  return NextResponse.json(
    { note: serializeMeetingNote(result.data.note) },
    {
      status: 201,
      headers: withProjectActivityVersionHeader(
        timing.headers(),
        result.data.activityVersion
      ),
    }
  );
}
