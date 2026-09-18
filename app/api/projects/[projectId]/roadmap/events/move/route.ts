import { NextRequest, NextResponse } from "next/server";

import {
  getAgentProjectAccessContext,
  requireApiPrincipal,
} from "@/lib/auth/api-guard";
import { logServerWarning } from "@/lib/observability/logger";
import { recordProjectActivityEventVersion } from "@/lib/project-activity-event-response";
import { withProjectActivityVersionHeader } from "@/lib/project-activity-version";
import { requireAgentProjectScopes } from "@/lib/services/project-access-service";
import {
  isValidRoadmapEventMovePayload,
  moveProjectRoadmapEvent,
} from "@/lib/services/project-roadmap-service";

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ projectId: string }> }
) {
  const params = await props.params;
  const principalResult = await requireApiPrincipal(request);
  if (!principalResult.ok) {
    return principalResult.response;
  }

  const agentAccess = getAgentProjectAccessContext(principalResult.principal);
  const agentScopeAccess = requireAgentProjectScopes({
    agentAccess,
    projectId: params.projectId,
    requiredScopes: ["roadmap:write"],
  });
  if (!agentScopeAccess.ok) {
    return NextResponse.json(
      { error: agentScopeAccess.error },
      { status: agentScopeAccess.status }
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch (error) {
    logServerWarning(
      "POST /api/projects/:projectId/roadmap/events/move.invalidJson",
      "Invalid JSON payload",
      { error }
    );
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  if (!isValidRoadmapEventMovePayload(payload)) {
    return NextResponse.json({ error: "invalid-payload" }, { status: 400 });
  }

  const result = await moveProjectRoadmapEvent({
    actorUserId: principalResult.principal.actorUserId,
    projectId: params.projectId,
    agentAccess,
    eventId: payload.eventId,
    targetPhaseId: payload.targetPhaseId,
    targetIndex: payload.targetIndex,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const version = await recordProjectActivityEventVersion({
    actorUserId: principalResult.principal.actorUserId,
    projectId: params.projectId,
    domain: "roadmap",
    action: "moved",
    entityId: payload.eventId,
    payload: {
      eventId: payload.eventId,
      targetPhaseId: payload.targetPhaseId,
      targetIndex: payload.targetIndex,
    },
    agentAccess,
    entityDisplayNameSnapshot: result.data.title,
    changes: [
      {
        field: "phase",
        before: result.data.fromPhaseTitle,
        after: result.data.toPhaseTitle,
      },
    ],
  });

  return NextResponse.json(
    { ok: true },
    { headers: withProjectActivityVersionHeader(undefined, version) }
  );
}
