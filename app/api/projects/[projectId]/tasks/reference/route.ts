import { NextRequest, NextResponse } from "next/server";
import { getAgentProjectAccessContext, requireApiPrincipal } from "@/lib/auth/api-guard";
import { resolveProjectTaskReference } from "@/lib/services/project-task-reference-service";

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ projectId: string }> }
) {
  const principal = await requireApiPrincipal(request);
  if (!principal.ok) return principal.response;
  const { projectId } = await props.params;
  const result = await resolveProjectTaskReference({
    projectId,
    actorUserId: principal.principal.actorUserId,
    agentAccess: getAgentProjectAccessContext(principal.principal),
    reference: request.nextUrl.searchParams.get("reference") ?? "",
    namespace: request.nextUrl.searchParams.get("namespace") ?? "current",
  });
  return result.ok
    ? NextResponse.json(result.data)
    : NextResponse.json({ error: result.error }, { status: result.status });
}
