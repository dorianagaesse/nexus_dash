import { NextRequest, NextResponse } from "next/server";

import {
  getAgentProjectAccessContext,
  requireApiPrincipal,
} from "@/lib/auth/api-guard";
import { recordProjectActivityEventVersion } from "@/lib/project-activity-event-response";
import { withProjectActivityVersionHeader } from "@/lib/project-activity-version";
import {
  archiveTaskForProject,
  unarchiveTaskForProject,
} from "@/lib/services/project-task-service";

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ projectId: string; taskId: string }> }
) {
  const params = await props.params;
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

  const version = await recordProjectActivityEventVersion({
    actorUserId: principalResult.principal.actorUserId,
    projectId,
    domain: "task",
    action: "archived",
    entityId: taskId,
    payload: { taskId },
    agentAccess,
    entityDisplayNameSnapshot: result.data.title,
  });

  return NextResponse.json(
    {
      ok: true,
      archivedAt: result.data.archivedAt.toISOString(),
    },
    {
      headers: withProjectActivityVersionHeader(undefined, version),
    }
  );
}

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ projectId: string; taskId: string }> }
) {
  const params = await props.params;
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

  const version = await recordProjectActivityEventVersion({
    actorUserId: principalResult.principal.actorUserId,
    projectId,
    domain: "task",
    action: "unarchived",
    entityId: taskId,
    payload: { taskId },
    agentAccess,
    entityDisplayNameSnapshot: result.data.title,
  });

  return NextResponse.json(
    { ok: true },
    {
      headers: withProjectActivityVersionHeader(undefined, version),
    }
  );
}
