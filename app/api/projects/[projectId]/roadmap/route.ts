import { NextRequest, NextResponse } from "next/server";

import {
  getAgentProjectAccessContext,
  requireApiPrincipal,
} from "@/lib/auth/api-guard";
import { logServerWarning } from "@/lib/observability/logger";
import { requireAgentProjectScopes } from "@/lib/services/project-access-service";
import {
  createProjectRoadmapPhase,
  listProjectRoadmapPhases,
} from "@/lib/services/project-roadmap-service";

interface RoadmapPhaseRequestBody {
  title?: unknown;
  description?: unknown;
  targetDate?: unknown;
  status?: unknown;
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

  const agentAccess = getAgentProjectAccessContext(principalResult.principal);
  const agentScopeAccess = requireAgentProjectScopes({
    agentAccess,
    projectId: params.projectId,
    requiredScopes: ["roadmap:read"],
  });
  if (!agentScopeAccess.ok) {
    return NextResponse.json(
      { error: agentScopeAccess.error },
      { status: agentScopeAccess.status }
    );
  }

  const phases = await listProjectRoadmapPhases(
    params.projectId,
    principalResult.principal.actorUserId,
    agentAccess
  );

  return NextResponse.json({
    phases,
  });
}

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

  let payload: RoadmapPhaseRequestBody;
  try {
    payload = (await request.json()) as RoadmapPhaseRequestBody;
  } catch (error) {
    logServerWarning("POST /api/projects/:projectId/roadmap.invalidJson", "Invalid JSON payload", {
      error,
    });
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  const result = await createProjectRoadmapPhase({
    actorUserId: principalResult.principal.actorUserId,
    projectId: params.projectId,
    agentAccess,
    title: typeof payload.title === "string" ? payload.title : "",
    description: typeof payload.description === "string" ? payload.description : null,
    targetDate: typeof payload.targetDate === "string" ? payload.targetDate : null,
    status: typeof payload.status === "string" ? payload.status : null,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(
    {
      phase: result.data.phase,
    },
    { status: 201 }
  );
}
