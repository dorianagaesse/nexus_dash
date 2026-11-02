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
  createTaskForProject,
  moveTaskStatusForProject,
  updateTaskForProject,
  type InvalidRelatedTaskDiagnostic,
  type TaskStatusTransitionPayload,
  type UpdatedTaskPayload,
} from "@/lib/services/project-task-service";
import { requireAgentProjectScopes } from "@/lib/services/project-access-service";
import {
  parseBulkTaskOperations,
  parseCreateTaskJsonInput,
  parseUpdateTaskJsonInput,
  toCreateTaskServiceInput,
  toUpdateTaskServiceInput,
} from "@/lib/task-contracts";

interface BulkResult {
  index: number;
  ok: boolean;
  status: number;
  taskId?: string;
  task?: UpdatedTaskPayload;
  error?: string;
  invalidRelatedTask?: InvalidRelatedTaskDiagnostic;
}

function serializeTask(
  projectId: string,
  taskId: string,
  task: UpdatedTaskPayload
): UpdatedTaskPayload {
  return {
    ...task,
    attachments: task.attachments.map((attachment) =>
      mapTaskAttachmentResponse(projectId, taskId, attachment)
    ),
  };
}

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ projectId: string }> }
) {
  const timing = startServerTiming("task.bulk");
  const params = await props.params;
  const principalResult = await requireApiPrincipal(request);
  if (!principalResult.ok) {
    return principalResult.response;
  }
  const actorUserId = principalResult.principal.actorUserId;
  const agentAccess = getAgentProjectAccessContext(principalResult.principal);
  const { projectId } = params;

  if (!projectId) {
    return NextResponse.json({ error: "Missing project id" }, { status: 400 });
  }

  const agentScopeAccess = requireAgentProjectScopes({
    agentAccess,
    projectId,
    requiredScopes: ["task:write"],
  });
  if (!agentScopeAccess.ok) {
    return NextResponse.json(
      { error: agentScopeAccess.error },
      { status: agentScopeAccess.status, headers: timing.headers() }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    logServerWarning(
      "POST /api/projects/:projectId/tasks/bulk.invalidJson",
      "Invalid JSON payload",
      { error }
    );
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const operations = parseBulkTaskOperations(body);
  if (!operations) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const results: BulkResult[] = [];

  for (const [index, operation] of operations.entries()) {
    if (operation.type === "create") {
      const parsedCreate = parseCreateTaskJsonInput(operation.task);
      if (!parsedCreate.ok) {
        results.push({ index, ok: false, status: 400, error: parsedCreate.error });
        continue;
      }

      const result = await createTaskForProject(
        toCreateTaskServiceInput(parsedCreate.data, {
          actorUserId,
          projectId,
          agentAccess,
        })
      );
      if (!result.ok) {
        results.push({
          index, ok: false, status: result.status, error: result.error,
          ...(result.invalidRelatedTask ? { invalidRelatedTask: result.invalidRelatedTask } : {}),
        });
        continue;
      }

      const rawTask = result.data.task;
      const task = serializeTask(projectId, rawTask.id, rawTask);
      results.push({
        index,
        ok: true,
        status: 201,
        taskId: rawTask.id,
        task,
      });
      continue;
    }

    if (operation.type === "update") {
      const parsedUpdate = parseUpdateTaskJsonInput(operation.changes, {
        taskId: operation.taskId,
        validateTitleLength: false,
      });
      if (!parsedUpdate.ok) {
        results.push({
          index,
          ok: false,
          status: 400,
          error: parsedUpdate.error,
          ...(parsedUpdate.invalidRelatedTask
            ? { invalidRelatedTask: parsedUpdate.invalidRelatedTask }
            : {}),
        });
        continue;
      }

      const result = await updateTaskForProject(
        projectId,
        operation.taskId,
        toUpdateTaskServiceInput(operation.changes, parsedUpdate.data),
        actorUserId,
        agentAccess
      );
      if (!result.ok) {
        results.push({
          index, ok: false, status: result.status, error: result.error,
          ...(result.invalidRelatedTask ? { invalidRelatedTask: result.invalidRelatedTask } : {}),
        });
        continue;
      }

      const rawTask = result.data.task;
      const task = serializeTask(projectId, rawTask.id, rawTask);
      results.push({
        index,
        ok: true,
        status: 200,
        taskId: rawTask.id,
        task,
      });
      continue;
    }

    const statusPayload: TaskStatusTransitionPayload = {
      status: operation.status,
      ...(operation.position !== undefined ? { position: operation.position } : {}),
    };
    const result = await moveTaskStatusForProject(
      projectId,
      operation.taskId,
      statusPayload,
      actorUserId,
      agentAccess
    );
    if (!result.ok) {
      results.push({ index, ok: false, status: result.status, error: result.error });
      continue;
    }

    const rawTask = result.data.task;
    const task = serializeTask(projectId, rawTask.id, rawTask);
    results.push({
      index,
      ok: true,
      status: 200,
      taskId: rawTask.id,
      task,
    });
  }

  const version = await recordProjectActivityEventVersion({
    actorUserId,
    projectId,
    domain: "task",
    action: "updated",
    entityId: projectId,
    payload: {
      results: results.map((result) => ({
        index: result.index,
        ok: result.ok,
        status: result.status,
        taskId: result.taskId,
      })),
    },
  });

  return NextResponse.json(
    { results },
    { headers: withProjectActivityVersionHeader(timing.headers(), version) }
  );
}
