import { NextRequest, NextResponse } from "next/server";

import {
  getAgentProjectAccessContext,
  requireApiPrincipal,
} from "@/lib/auth/api-guard";
import { logServerWarning } from "@/lib/observability/logger";
import {
  deleteTaskForProject,
  type UpdateTaskPayload,
  updateTaskForProject,
} from "@/lib/services/project-task-service";

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ projectId: string; taskId: string }> }
) {
  const params = await props.params;
  const principalResult = await requireApiPrincipal(request);
  if (!principalResult.ok) {
    return principalResult.response;
  }
  const actorUserId = principalResult.principal.actorUserId;
  const agentAccess = getAgentProjectAccessContext(principalResult.principal);
  const { projectId, taskId } = params;

  if (!projectId || !taskId) {
    return NextResponse.json({ error: "Missing route parameters" }, { status: 400 });
  }

  let payload: UpdateTaskPayload;

  try {
    payload = (await request.json()) as UpdateTaskPayload;
  } catch (error) {
    logServerWarning(
      "PATCH /api/projects/:projectId/tasks/:taskId.invalidJson",
      "Invalid JSON payload",
      { error }
    );
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const result = await updateTaskForProject(
    projectId,
    taskId,
    payload,
    actorUserId,
    agentAccess
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ task: result.data.task });
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
  const actorUserId = principalResult.principal.actorUserId;
  const agentAccess = getAgentProjectAccessContext(principalResult.principal);
  const { projectId, taskId } = params;

  if (!projectId || !taskId) {
    return NextResponse.json({ error: "Missing route parameters" }, { status: 400 });
  }

  const result = await deleteTaskForProject(
    projectId,
    taskId,
    actorUserId,
    agentAccess
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true });
}
