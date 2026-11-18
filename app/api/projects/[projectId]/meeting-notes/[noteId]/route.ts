import { NextRequest, NextResponse } from "next/server";

import { getAgentProjectAccessContext, requireApiPrincipal } from "@/lib/auth/api-guard";
import { logServerWarning } from "@/lib/observability/logger";
import { startServerTiming } from "@/lib/observability/server-timing";
import { recordProjectActivityEventVersion } from "@/lib/project-activity-event-response";
import { withProjectActivityVersionHeader } from "@/lib/project-activity-version";
import { contentErrorBody, parseContentPrecondition, withContentEtag } from "@/lib/content-revision";
import { parseUpdateMeetingNoteInput } from "@/lib/meeting-note-contracts";
import {
  deleteProjectMeetingNote,
  getProjectMeetingNote,
  updateProjectMeetingNote,
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

export async function GET(request: NextRequest, props: { params: Promise<{ projectId: string; noteId: string }> }) {
  const params = await props.params;
  const user = await requireApiPrincipal(request);
  if (!user.ok) return user.response;
  const result = await getProjectMeetingNote({ ...params, actorUserId: user.principal.actorUserId, agentAccess: getAgentProjectAccessContext(user.principal) });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ note: serializeMeetingNote(result.data.note) }, { headers: withContentEtag({}, "meeting-note", result.data.note) });
}

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ projectId: string; noteId: string }> }
) {
  const timing = startServerTiming("meeting-note.update");
  const params = await props.params;
  const authenticatedUser = await requireApiPrincipal(request);
  if (!authenticatedUser.ok) {
    return authenticatedUser.response;
  }
  const precondition = parseContentPrecondition(request.headers, "meeting-note", params.noteId);
  if (!precondition.ok) return NextResponse.json({ error: precondition.error }, { status: 400 });

  const payload = await readJsonPayload(
    request,
    "PATCH /api/projects/:projectId/meeting-notes/:noteId.invalidJson"
  );
  if (payload instanceof NextResponse) {
    return payload;
  }
  const parsed = parseUpdateMeetingNoteInput(payload);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  const result = await updateProjectMeetingNote({
    agentAccess: getAgentProjectAccessContext(authenticatedUser.principal),
    actorUserId: authenticatedUser.principal.actorUserId,
    projectId: params.projectId,
    noteId: params.noteId,
    ...parsed.data,
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
  const authenticatedUser = await requireApiPrincipal(request);
  if (!authenticatedUser.ok) {
    return authenticatedUser.response;
  }

  const result = await deleteProjectMeetingNote({
    agentAccess: getAgentProjectAccessContext(authenticatedUser.principal),
    actorUserId: authenticatedUser.principal.actorUserId,
    projectId: params.projectId,
    noteId: params.noteId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const version =
    result.data.visibility === "private"
      ? new Date()
      : await recordProjectActivityEventVersion({
          actorUserId: authenticatedUser.principal.actorUserId,
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
