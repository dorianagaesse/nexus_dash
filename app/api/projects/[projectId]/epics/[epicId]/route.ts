import { NextRequest, NextResponse } from "next/server";

import {
  getAgentProjectAccessContext,
  requireApiPrincipal,
} from "@/lib/auth/api-guard";
import { logServerWarning } from "@/lib/observability/logger";
import { recordProjectActivityEventVersion } from "@/lib/project-activity-event-response";
import { withProjectActivityVersionHeader } from "@/lib/project-activity-version";
import {
  deleteProjectEpic,
  updateProjectEpic,
} from "@/lib/services/project-epic-service";
import { serializeProjectEpicResponse } from "@/lib/services/project-epic-response";

interface ProjectEpicRequestBody {
  name?: unknown;
  description?: unknown;
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

  const result = await updateProjectEpic({
    actorUserId: principalResult.principal.actorUserId,
    projectId: params.projectId,
    epicId: params.epicId,
    name: typeof payload.name === "string" ? payload.name : "",
    description: typeof payload.description === "string" ? payload.description : "",
    agentAccess: getAgentProjectAccessContext(principalResult.principal),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const version = await recordProjectActivityEventVersion({
    actorUserId: principalResult.principal.actorUserId,
    projectId: params.projectId,
    domain: "epic",
    action: "updated",
    entityId: result.data.epic.id,
    payload: { epic: serializeProjectEpicResponse(result.data.epic) },
    agentAccess: getAgentProjectAccessContext(principalResult.principal),
    entityDisplayNameSnapshot: result.data.epic.name,
    changes: [
      {
        field: "name",
        before: result.data.previous.name,
        after: result.data.epic.name,
      },
      {
        field: "description",
        before: result.data.previous.description,
        after: result.data.epic.description,
      },
    ],
  });

  return NextResponse.json(
    {
      epic: serializeProjectEpicResponse(result.data.epic),
    },
    { headers: withProjectActivityVersionHeader(undefined, version) }
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
    agentAccess: getAgentProjectAccessContext(principalResult.principal),
    entityDisplayNameSnapshot: result.data.name,
  });

  return NextResponse.json(
    { ok: true },
    { headers: withProjectActivityVersionHeader(undefined, version) }
  );
}
