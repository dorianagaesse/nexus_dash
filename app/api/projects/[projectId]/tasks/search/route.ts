import { NextRequest, NextResponse } from "next/server";

import {
  getAgentProjectAccessContext,
  requireApiPrincipal,
} from "@/lib/auth/api-guard";
import { startServerTiming } from "@/lib/observability/server-timing";
import { requireAgentProjectScopes } from "@/lib/services/project-access-service";
import { searchProjectTaskIds } from "@/lib/services/project-task-search-service";

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ projectId: string }> }
) {
  const timing = startServerTiming("tasks.search");
  const principalResult = await requireApiPrincipal(request);
  if (!principalResult.ok) {
    return principalResult.response;
  }

  const { projectId } = await props.params;
  const agentAccess = getAgentProjectAccessContext(principalResult.principal);
  const agentScopeAccess = requireAgentProjectScopes({
    agentAccess,
    projectId,
    requiredScopes: ["task:read"],
  });
  if (!agentScopeAccess.ok) {
    return NextResponse.json(
      { error: agentScopeAccess.error },
      { status: agentScopeAccess.status, headers: timing.headers() }
    );
  }

  const limitParam = request.nextUrl.searchParams.get("limit")?.trim() || null;
  let limitFilter: number | null = null;
  if (limitParam) {
    const parsedLimit = Number.parseInt(limitParam, 10);
    if (!Number.isFinite(parsedLimit)) {
      return NextResponse.json(
        { error: "invalid-limit" },
        { status: 400, headers: timing.headers() }
      );
    }
    limitFilter = Math.min(Math.max(parsedLimit, 1), 200);
  }

  const result = await searchProjectTaskIds({
    actorUserId: principalResult.principal.actorUserId,
    projectId,
    query: request.nextUrl.searchParams.get("q") ?? "",
    agentAccess,
    limit: limitFilter,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status, headers: timing.headers() }
    );
  }

  return NextResponse.json(result.data, { headers: timing.headers() });
}
