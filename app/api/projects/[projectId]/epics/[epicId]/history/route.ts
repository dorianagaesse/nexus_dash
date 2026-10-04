import { NextRequest, NextResponse } from "next/server";

import {
  getAgentProjectAccessContext,
  requireApiPrincipal,
} from "@/lib/auth/api-guard";
import {
  listProjectEpicHistory,
  PROJECT_EPIC_HISTORY_DEFAULT_LIMIT,
} from "@/lib/services/project-epic-service";

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ projectId: string; epicId: string }> }
) {
  const params = await props.params;
  const principalResult = await requireApiPrincipal(request);
  if (!principalResult.ok) {
    return principalResult.response;
  }

  const takeParam = request.nextUrl.searchParams.get("take");
  const parsedTake = takeParam ? Number.parseInt(takeParam, 10) : NaN;

  const result = await listProjectEpicHistory({
    actorUserId: principalResult.principal.actorUserId,
    projectId: params.projectId,
    epicId: params.epicId,
    agentAccess: getAgentProjectAccessContext(principalResult.principal),
    take: Number.isFinite(parsedTake) ? parsedTake : PROJECT_EPIC_HISTORY_DEFAULT_LIMIT,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    entries: result.data.entries.map((entry) => ({
      ...entry,
      version: entry.version.toISOString(),
    })),
  });
}
