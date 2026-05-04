import { NextRequest, NextResponse } from "next/server";

import {
  getAgentProjectAccessContext,
  requireApiPrincipal,
} from "@/lib/auth/api-guard";
import { searchProjectMembersForMention } from "@/lib/services/project-collaboration-service";

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ projectId: string }> }
) {
  const params = await props.params;
  const principalResult = await requireApiPrincipal(request);
  if (!principalResult.ok) {
    return principalResult.response;
  }

  const result = await searchProjectMembersForMention({
    actorUserId: principalResult.principal.actorUserId,
    agentAccess: getAgentProjectAccessContext(principalResult.principal),
    projectId: params.projectId,
    query: request.nextUrl.searchParams.get("query") ?? "",
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.data);
}
