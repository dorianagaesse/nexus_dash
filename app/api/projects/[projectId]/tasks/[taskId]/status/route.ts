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
  isTaskStatusTransitionPayload,
  moveTaskStatusForProject,
} from "@/lib/services/project-task-service";

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ projectId: string; taskId: string }> }
) {
  const timing = startServerTiming("task.status");
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

  let body: unknown;

  try {
    body = await request.json();
  } catch (error) {
    logServerWarning(
      "POST /api/projects/:projectId/tasks/:taskId/status.invalidJson",
      "Invalid JSON payload",
      { error }
    );
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  if (!isTaskStatusTransitionPayload(body)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const result = await moveTaskStatusForProject(
    projectId,
    taskId,
    body,
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
    action: "moved",
    entityId: taskId,
    payload: { task },
  });

  return NextResponse.json(
    { task },
    { headers: withProjectActivityVersionHeader(timing.headers(), version) }
  );
}
