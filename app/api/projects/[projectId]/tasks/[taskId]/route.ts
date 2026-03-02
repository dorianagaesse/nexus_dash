import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedApiUser } from "@/lib/auth/api-guard";
import { logServerWarning } from "@/lib/observability/logger";
import { createRouteTimer } from "@/lib/observability/server-timing";
import {
  deleteTaskForProject,
  type UpdateTaskPayload,
  updateTaskForProject,
} from "@/lib/services/project-task-service";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { projectId: string; taskId: string } }
) {
  const timer = createRouteTimer("PATCH /api/projects/:projectId/tasks/:taskId", request);
  const authenticatedUser = await timer.measure("auth", () =>
    requireAuthenticatedApiUser(request)
  );
  if (!authenticatedUser.ok) {
    return timer.finalize({ response: authenticatedUser.response });
  }
  const actorUserId = authenticatedUser.userId;
  const { projectId, taskId } = params;

  if (!projectId || !taskId) {
    return timer.finalize({
      response: NextResponse.json({ error: "Missing route parameters" }, { status: 400 }),
    });
  }

  let payload: UpdateTaskPayload;

  try {
    payload = await timer.measure("parse", () =>
      request.json() as Promise<UpdateTaskPayload>
    );
  } catch (error) {
    logServerWarning(
      "PATCH /api/projects/:projectId/tasks/:taskId.invalidJson",
      "Invalid JSON payload",
      { error }
    );
    return timer.finalize({
      response: NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 }),
    });
  }

  const result = await timer.measure("service:update", () =>
    updateTaskForProject(projectId, taskId, payload, actorUserId)
  );
  if (!result.ok) {
    return timer.finalize({
      response: NextResponse.json({ error: result.error }, { status: result.status }),
    });
  }

  return timer.finalize({
    response: NextResponse.json({ task: result.data.task }),
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { projectId: string; taskId: string } }
) {
  const timer = createRouteTimer("DELETE /api/projects/:projectId/tasks/:taskId", request);
  const authenticatedUser = await timer.measure("auth", () =>
    requireAuthenticatedApiUser(request)
  );
  if (!authenticatedUser.ok) {
    return timer.finalize({ response: authenticatedUser.response });
  }
  const actorUserId = authenticatedUser.userId;
  const { projectId, taskId } = params;

  if (!projectId || !taskId) {
    return timer.finalize({
      response: NextResponse.json({ error: "Missing route parameters" }, { status: 400 }),
    });
  }

  const result = await timer.measure("service:delete", () =>
    deleteTaskForProject(projectId, taskId, actorUserId)
  );
  if (!result.ok) {
    return timer.finalize({
      response: NextResponse.json({ error: result.error }, { status: result.status }),
    });
  }

  return timer.finalize({
    response: NextResponse.json({ ok: true }),
  });
}
