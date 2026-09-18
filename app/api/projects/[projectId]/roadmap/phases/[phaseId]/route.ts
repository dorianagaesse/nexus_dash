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
  deleteProjectRoadmapPhase,
  updateProjectRoadmapPhase,
} from "@/lib/services/project-roadmap-service";

interface RoadmapPhaseRequestBody {
  title?: unknown;
  description?: unknown;
  targetDate?: unknown;
  status?: unknown;
}

function hasOwn(payload: RoadmapPhaseRequestBody, key: keyof RoadmapPhaseRequestBody) {
  return Object.prototype.hasOwnProperty.call(payload, key);
}

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ projectId: string; phaseId: string }> }
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
    logServerWarning(
      "PATCH /api/projects/:projectId/roadmap/phases/:phaseId.invalidJson",
      "Invalid JSON payload",
      { error }
    );
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  if (hasOwn(payload, "title") && typeof payload.title !== "string") {
    return NextResponse.json({ error: "invalid-payload" }, { status: 400 });
  }
  if (
    hasOwn(payload, "description") &&
    payload.description !== null &&
    typeof payload.description !== "string"
  ) {
    return NextResponse.json({ error: "invalid-payload" }, { status: 400 });
  }
  if (
    hasOwn(payload, "targetDate") &&
    payload.targetDate !== null &&
    typeof payload.targetDate !== "string"
  ) {
    return NextResponse.json({ error: "invalid-payload" }, { status: 400 });
  }
  if (
    hasOwn(payload, "status") &&
    payload.status !== null &&
    typeof payload.status !== "string"
  ) {
    return NextResponse.json({ error: "invalid-payload" }, { status: 400 });
  }

  const result = await updateProjectRoadmapPhase({
    actorUserId: principalResult.principal.actorUserId,
    projectId: params.projectId,
    phaseId: params.phaseId,
    agentAccess,
    ...(hasOwn(payload, "title") ? { title: payload.title as string } : {}),
    ...(hasOwn(payload, "description")
      ? { description: (payload.description ?? null) as string | null }
      : {}),
    ...(hasOwn(payload, "targetDate")
      ? { targetDate: (payload.targetDate ?? null) as string | null }
      : {}),
    ...(hasOwn(payload, "status")
      ? { status: (payload.status ?? null) as string | null }
      : {}),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const version = await recordProjectActivityEventVersion({
    actorUserId: principalResult.principal.actorUserId,
    projectId: params.projectId,
    domain: "roadmap",
    action: "updated",
    entityId: result.data.phase.id,
    payload: { phase: result.data.phase },
    agentAccess,
    entityDisplayNameSnapshot: result.data.phase.title,
    changes: [
      {
        field: "title",
        before: result.data.previous.title,
        after: result.data.phase.title,
      },
      {
        field: "description",
        before: result.data.previous.description,
        after: result.data.phase.description,
      },
      {
        field: "targetDate",
        before: result.data.previous.targetDate,
        after: result.data.phase.targetDate,
      },
      {
        field: "status",
        before: result.data.previous.status,
        after: result.data.phase.status,
      },
    ],
  });

  return NextResponse.json(
    {
      phase: result.data.phase,
    },
    { headers: withProjectActivityVersionHeader(undefined, version) }
  );
}

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ projectId: string; phaseId: string }> }
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
    requiredScopes: ["roadmap:delete"],
  });
  if (!agentScopeAccess.ok) {
    return NextResponse.json(
      { error: agentScopeAccess.error },
      { status: agentScopeAccess.status }
    );
  }

  const result = await deleteProjectRoadmapPhase({
    actorUserId: principalResult.principal.actorUserId,
    projectId: params.projectId,
    phaseId: params.phaseId,
    agentAccess,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const version = await recordProjectActivityEventVersion({
    actorUserId: principalResult.principal.actorUserId,
    projectId: params.projectId,
    domain: "roadmap",
    action: "deleted",
    entityId: params.phaseId,
    payload: { phaseId: params.phaseId },
    agentAccess,
    entityDisplayNameSnapshot: result.data.title,
  });

  return NextResponse.json(
    { ok: true },
    { headers: withProjectActivityVersionHeader(undefined, version) }
  );
}
