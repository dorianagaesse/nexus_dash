import { NextRequest, NextResponse } from "next/server";

import {
  getAgentProjectAccessContext,
  requireAuthenticatedApiUser,
  requireApiPrincipal,
} from "@/lib/auth/api-guard";
import { isMeetingTodoActorReference } from "@/lib/meeting-todo-actor";
import { logServerWarning } from "@/lib/observability/logger";
import { recordProjectActivityEventVersion } from "@/lib/project-activity-event-response";
import { withProjectActivityVersionHeader } from "@/lib/project-activity-version";
import {
  setProjectMeetingNoteActionCompletion,
  setProjectMeetingNoteActionAssignee,
  type ProjectMeetingNoteSummary,
} from "@/lib/services/project-meeting-note-service";

interface MeetingNoteActionRequestBody {
  completed?: unknown;
  assignee?: unknown;
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
  const usesAgentBearer = request.headers
    .get("authorization")
    ?.trim()
    .toLowerCase()
    .startsWith("bearer ");
  const principal = usesAgentBearer
    ? await (async () => {
        const result = await requireApiPrincipal(request);
        return result.ok ? result.principal : result.response;
      })()
    : await (async () => {
        const result = await requireAuthenticatedApiUser(request);
        return result.ok
          ? ({
              kind: "human" as const,
              actorUserId: result.userId,
              requestId: "session",
            } as const)
          : result.response;
      })();
  if (principal instanceof NextResponse) {
    return principal;
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

  const hasCompletedProperty = Object.prototype.hasOwnProperty.call(
    payload,
    "completed"
  );
  const hasCompleted = typeof payload.completed === "boolean";
  const hasAssignee = Object.prototype.hasOwnProperty.call(payload, "assignee");
  if (hasCompletedProperty && !hasCompleted) {
    return NextResponse.json(
      { error: "meeting-note-action-completed-invalid" },
      { status: 400 }
    );
  }
  if (hasCompleted === hasAssignee) {
    return NextResponse.json(
      { error: "meeting-note-action-update-invalid" },
      { status: 400 }
    );
  }

  if (
    hasAssignee &&
    payload.assignee !== null &&
    !isMeetingTodoActorReference(payload.assignee)
  ) {
    return NextResponse.json(
      { error: "meeting-note-action-assignee-invalid" },
      { status: 400 }
    );
  }

  const commonInput = {
    actorUserId: principal.actorUserId,
    projectId: params.projectId,
    noteId: params.noteId,
    actionId: params.actionId,
    agentAccess:
      principal.kind === "agent"
        ? getAgentProjectAccessContext(principal)
        : undefined,
  };
  const result = hasCompleted
    ? await setProjectMeetingNoteActionCompletion({
        ...commonInput,
        completed: payload.completed as boolean,
      })
    : await setProjectMeetingNoteActionAssignee({
        ...commonInput,
        assignee:
          payload.assignee === null
            ? null
            : (payload.assignee as { kind: "human" | "agent"; id: string }),
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
      actionId: params.actionId,
      actorCredentialId:
        principal.kind === "agent" ? principal.credentialId : null,
    },
  });

  return NextResponse.json(
    { note: serializeMeetingNote(result.data.note) },
    {
      headers: withProjectActivityVersionHeader(new Headers(), version),
    }
  );
}
