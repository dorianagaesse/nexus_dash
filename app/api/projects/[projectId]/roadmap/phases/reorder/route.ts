import { NextRequest, NextResponse } from "next/server";

import {
  getAgentProjectAccessContext,
  requireApiPrincipal,
} from "@/lib/auth/api-guard";
import { logServerWarning } from "@/lib/observability/logger";
import { requireAgentProjectScopes } from "@/lib/services/project-access-service";
import {
  isValidRoadmapPhaseReorderPayload,
  reorderProjectRoadmapPhases,
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
      "POST /api/projects/:projectId/roadmap/phases/reorder.invalidJson",
      "Invalid JSON payload",
      { error }
    );
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  if (!isValidRoadmapPhaseReorderPayload(payload)) {
    return NextResponse.json({ error: "invalid-payload" }, { status: 400 });
  }

  const result = await reorderProjectRoadmapPhases({
    actorUserId: principalResult.principal.actorUserId,
    projectId: params.projectId,
    agentAccess,
    phaseIds: payload.phaseIds,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true });
}
