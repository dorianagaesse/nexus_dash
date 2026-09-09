import { NextRequest, NextResponse } from "next/server";

import {
  getAgentProjectAccessContext,
  requireApiPrincipal,
} from "@/lib/auth/api-guard";
import { searchProjectActors } from "@/lib/services/project-actor-service";

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ projectId: string }> }
) {
  const params = await props.params;
  const principalResult = await requireApiPrincipal(request);
  if (!principalResult.ok) {
    principalResult.response.headers.set("Cache-Control", "no-store");
    return principalResult.response;
  }

  const result = await searchProjectActors({
    actorUserId: principalResult.principal.actorUserId,
    agentAccess: getAgentProjectAccessContext(principalResult.principal),
    projectId: params.projectId,
    query: request.nextUrl.searchParams.get("query") ?? "",
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      {
        status: result.status,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
  return NextResponse.json(result.data, {
    headers: { "Cache-Control": "no-store" },
  });
}
