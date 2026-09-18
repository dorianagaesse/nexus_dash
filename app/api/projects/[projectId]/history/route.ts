import { NextRequest, NextResponse } from "next/server";

import {
  getAgentProjectAccessContext,
  requireApiPrincipal,
} from "@/lib/auth/api-guard";
import {
  listProjectActivityHistory,
  PROJECT_ACTIVITY_HISTORY_PAGE_SIZE,
} from "@/lib/services/project-activity-service";
import { requireAgentProjectScopes } from "@/lib/services/project-access-service";

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
    requiredScopes: ["project:read"],
  });
  if (!agentScopeAccess.ok) {
    return NextResponse.json(
      { error: agentScopeAccess.error },
      { status: agentScopeAccess.status, headers: { "Cache-Control": "no-store" } }
    );
  }

  const takeParam = Number.parseInt(
    request.nextUrl.searchParams.get("take") ?? "",
    10
  );

  const result = await listProjectActivityHistory({
    actorUserId: principalResult.principal.actorUserId,
    projectId: params.projectId,
    cursor: request.nextUrl.searchParams.get("cursor"),
    take: Number.isFinite(takeParam)
      ? takeParam
      : PROJECT_ACTIVITY_HISTORY_PAGE_SIZE,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status, headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json(
    {
      entries: result.data.entries.map((entry) => ({
        id: entry.id,
        domain: entry.domain,
        action: entry.action,
        entityId: entry.entityId,
        entityDisplayNameSnapshot: entry.entityDisplayNameSnapshot,
        summary: entry.summary,
        changes: entry.changes,
        version: entry.version.toISOString(),
        createdAt: entry.createdAt.toISOString(),
        actor: entry.actor,
      })),
      nextCursor: result.data.nextCursor,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
