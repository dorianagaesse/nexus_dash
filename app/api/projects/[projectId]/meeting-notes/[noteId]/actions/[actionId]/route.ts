import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedApiUser } from "@/lib/auth/api-guard";
import { logServerWarning } from "@/lib/observability/logger";
import { recordProjectActivityEventVersion } from "@/lib/project-activity-event-response";
import { withProjectActivityVersionHeader } from "@/lib/project-activity-version";
import {
  setProjectMeetingNoteActionCompletion,
  type ProjectMeetingNoteSummary,
} from "@/lib/services/project-meeting-note-service";

interface MeetingNoteActionRequestBody {
  completed?: unknown;
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

export async function PATCH(
  request: NextRequest,
  props: {
    params: Promise<{
      projectId: string;
      noteId: string;
      actionId: string;
    }>;
  }
) {
  const params = await props.params;
  const authenticatedUser = await requireAuthenticatedApiUser(request);
  if (!authenticatedUser.ok) {
    return authenticatedUser.response;
  }

  let payload: MeetingNoteActionRequestBody;
  try {
    payload = (await request.json()) as MeetingNoteActionRequestBody;
  } catch (error) {
    logServerWarning(
      "PATCH /api/projects/:projectId/meeting-notes/:noteId/actions/:actionId.invalidJson",
      "Invalid JSON payload",
      { error }
    );
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  if (typeof payload.completed !== "boolean") {
    return NextResponse.json(
      { error: "meeting-note-action-completed-invalid" },
      { status: 400 }
    );
  }

  const result = await setProjectMeetingNoteActionCompletion({
    actorUserId: authenticatedUser.userId,
    projectId: params.projectId,
    noteId: params.noteId,
    actionId: params.actionId,
    completed: payload.completed,
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
    payload: {
      noteId: result.data.note.id,
      actionId: params.actionId,
    },
  });

  return NextResponse.json(
    { note: serializeMeetingNote(result.data.note) },
    {
      headers: withProjectActivityVersionHeader(new Headers(), version),
    }
  );
}
