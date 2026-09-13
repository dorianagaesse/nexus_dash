import { NextRequest, NextResponse } from "next/server";

import {
  getAgentProjectAccessContext,
  requireApiPrincipal,
} from "@/lib/auth/api-guard";
import {
  mapAgentAttentionFiltersToResponse,
  parseAgentAttentionListFilters,
} from "@/lib/agent-attention";
import { startServerTiming } from "@/lib/observability/server-timing";
import {
  listAgentAssignments,
  mapAgentAssignmentItemToResponse,
} from "@/lib/services/project-agent-attention-service";

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ projectId: string }> }
) {
  const timing = startServerTiming("agent-attention.assignments.list");
  const params = await props.params;
  const principalResult = await requireApiPrincipal(request);
  if (!principalResult.ok) {
    return principalResult.response;
  }

  const agentAccess = getAgentProjectAccessContext(principalResult.principal);
  if (!agentAccess) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const searchParams = request.nextUrl.searchParams;
  const parsedFilters = parseAgentAttentionListFilters({
    searchParams,
    allowedEventTypes: ["assignment"],
    allowedArtifactTypes: ["task", "meeting_todo"],
    allowedStates: ["active", "completed"],
  });
  if (!parsedFilters.ok) {
    return NextResponse.json({ error: parsedFilters.error }, { status: 400 });
  }

  const result = await listAgentAssignments({
    actorUserId: principalResult.principal.actorUserId,
    projectId: params.projectId,
    agentAccess,
    filters: parsedFilters.filters,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status, headers: timing.headers() }
    );
  }

  const rawCursor = searchParams.get("cursor");

  return NextResponse.json(
    {
      projectId: params.projectId,
      filters: mapAgentAttentionFiltersToResponse({
        filters: parsedFilters.filters,
        rawCursor: rawCursor && rawCursor.trim().length > 0 ? rawCursor.trim() : null,
      }),
      items: result.data.items.map(mapAgentAssignmentItemToResponse),
      nextCursor: result.data.nextCursor,
    },
    { headers: timing.headers() }
  );
}
