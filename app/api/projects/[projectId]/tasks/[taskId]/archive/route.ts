import { NextRequest, NextResponse } from "next/server";

import {
  getAgentProjectAccessContext,
  requireApiPrincipal,
} from "@/lib/auth/api-guard";
import {
  archiveTaskForProject,
  unarchiveTaskForProject,
} from "@/lib/services/project-task-service";

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string; taskId: string } }
) {
  const principalResult = await requireApiPrincipal(request);
  if (!principalResult.ok) {
    return principalResult.response;
  }
  const agentAccess = getAgentProjectAccessContext(principalResult.principal);

  const { projectId, taskId } = params;
  if (!projectId || !taskId) {
    return NextResponse.json({ error: "Missing route parameters" }, { status: 400 });
  }

  const result = await archiveTaskForProject(
    projectId,
    taskId,
    principalResult.principal.actorUserId,
    agentAccess
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    archivedAt: result.data.archivedAt.toISOString(),
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { projectId: string; taskId: string } }
) {
  const principalResult = await requireApiPrincipal(request);
  if (!principalResult.ok) {
    return principalResult.response;
  }
  const agentAccess = getAgentProjectAccessContext(principalResult.principal);

  const { projectId, taskId } = params;
  if (!projectId || !taskId) {
    return NextResponse.json({ error: "Missing route parameters" }, { status: 400 });
  }

  const result = await unarchiveTaskForProject(
    projectId,
    taskId,
    principalResult.principal.actorUserId,
    agentAccess
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true });
}
