import { NextRequest, NextResponse } from "next/server";

import {
  getAgentProjectAccessContext,
  requireApiPrincipal,
} from "@/lib/auth/api-guard";
import { logServerWarning } from "@/lib/observability/logger";
import { startServerTiming } from "@/lib/observability/server-timing";
import { recordProjectActivityEventVersion } from "@/lib/project-activity-event-response";
import { withProjectActivityVersionHeader } from "@/lib/project-activity-version";
import { mapTaskAttachmentResponse } from "@/lib/services/project-attachment-service";
import {
  deleteTaskForProject,
  type UpdateTaskPayload,
  updateTaskForProject,
} from "@/lib/services/project-task-service";

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ projectId: string; taskId: string }> }
) {
  const timing = startServerTiming("task.update");
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
    return NextResponse.json(
      { error: result.error },
      { status: result.status, headers: timing.headers() }
    );
  }

  const rawTask = result.data.task;
  const task =
    Array.isArray(rawTask.attachments)
      ? {
          ...rawTask,
          attachments: rawTask.attachments.map((attachment) =>
            mapTaskAttachmentResponse(projectId, taskId, attachment)
          ),
        }
      : rawTask;

  const version = await recordProjectActivityEventVersion({
    actorUserId,
    projectId,
    domain: "task",
    action: "updated",
    entityId: taskId,
    payload: { task },
  });

  return NextResponse.json(
    { task },
    { headers: withProjectActivityVersionHeader(timing.headers(), version) }
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

  const version = await recordProjectActivityEventVersion({
    actorUserId,
    projectId,
    domain: "task",
    action: "deleted",
    entityId: taskId,
    payload: { taskId },
  });

  return NextResponse.json(
    {
      ok: true,
    },
    {
      headers: withProjectActivityVersionHeader(undefined, version),
    }
  );
}
