import { NextRequest, NextResponse } from "next/server";

import {
  getAgentProjectAccessContext,
  requireApiPrincipal,
} from "@/lib/auth/api-guard";
import { getProjectActivitySnapshot } from "@/lib/services/project-activity-service";
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
      {
        status: agentScopeAccess.status,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }

  const result = await getProjectActivitySnapshot({
    actorUserId: principalResult.principal.actorUserId,
    projectId: params.projectId,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      {
        status: result.status,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }

  return NextResponse.json(
    {
      projectId: result.data.projectId,
      version: result.data.version.toISOString(),
      serverTime: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
