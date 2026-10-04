import { NextRequest, NextResponse } from "next/server";

import {
  getAgentProjectAccessContext,
  requireApiPrincipal,
} from "@/lib/auth/api-guard";
import { logServerWarning } from "@/lib/observability/logger";
import { isProjectActorReference, type ProjectActorReference } from "@/lib/project-actor";
import { recordProjectActivityEventVersion } from "@/lib/project-activity-event-response";
import { withProjectActivityVersionHeader } from "@/lib/project-activity-version";
import {
  deleteProjectEpic,
  updateProjectEpic,
  type ProjectEpicLeadChange,
} from "@/lib/services/project-epic-service";
import {
  serializeProjectEpicEventActor,
  serializeProjectEpicResponse,
} from "@/lib/services/project-epic-response";

interface ProjectEpicRequestBody {
  name?: unknown;
  description?: unknown;
  lead?: unknown;
}

function serializeLeadChangeActor(
  actor: ProjectEpicLeadChange["previous"]
) {
  return actor ? serializeProjectEpicEventActor(actor) : null;
}

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ projectId: string; epicId: string }> }
) {
  const params = await props.params;
  const principalResult = await requireApiPrincipal(request);
  if (!principalResult.ok) {
    return principalResult.response;
  }

  let payload: ProjectEpicRequestBody;
  try {
    payload = (await request.json()) as ProjectEpicRequestBody;
  } catch (error) {
    logServerWarning(
      "PATCH /api/projects/:projectId/epics/:epicId.invalidJson",
      "Invalid JSON payload",
      { error }
    );
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  let lead: ProjectActorReference | undefined;
  if (payload.lead !== undefined) {
    if (!isProjectActorReference(payload.lead)) {
      return NextResponse.json(
        { error: "epic-lead-invalid" },
        { status: 400 }
      );
    }
    lead = { kind: payload.lead.kind, id: payload.lead.id.trim() };
  }

  const result = await updateProjectEpic({
    actorUserId: principalResult.principal.actorUserId,
    projectId: params.projectId,
    epicId: params.epicId,
    name: typeof payload.name === "string" ? payload.name : "",
    description: typeof payload.description === "string" ? payload.description : "",
    lead,
    agentAccess: getAgentProjectAccessContext(principalResult.principal),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const serializedEpic = serializeProjectEpicResponse(result.data.epic);
  const version = await recordProjectActivityEventVersion({
    actorUserId: principalResult.principal.actorUserId,
    projectId: params.projectId,
    domain: "epic",
    action: "updated",
    entityId: params.epicId,
    payload: {
      epic: serializedEpic,
      actor: serializeProjectEpicEventActor(result.data.actor),
      ...(result.data.leadChange
        ? {
            leadChange: {
              previous: serializeLeadChangeActor(result.data.leadChange.previous),
              next: serializeLeadChangeActor(result.data.leadChange.next),
            },
          }
        : {}),
    },
  });

  return NextResponse.json(
    {
      epic: serializedEpic,
    },
    {
      headers: withProjectActivityVersionHeader(undefined, version),
    }
  );
}

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ projectId: string; epicId: string }> }
) {
  const params = await props.params;
  const principalResult = await requireApiPrincipal(request);
  if (!principalResult.ok) {
    return principalResult.response;
  }

  const result = await deleteProjectEpic({
    actorUserId: principalResult.principal.actorUserId,
    projectId: params.projectId,
    epicId: params.epicId,
    agentAccess: getAgentProjectAccessContext(principalResult.principal),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const version = await recordProjectActivityEventVersion({
    actorUserId: principalResult.principal.actorUserId,
    projectId: params.projectId,
    domain: "epic",
    action: "deleted",
    entityId: params.epicId,
    payload: { epicId: params.epicId },
  });

  return NextResponse.json(
    { ok: true },
    {
      headers: withProjectActivityVersionHeader(undefined, version),
    }
  );
}
