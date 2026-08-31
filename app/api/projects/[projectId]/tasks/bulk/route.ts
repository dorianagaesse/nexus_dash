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
  MAX_BULK_TASK_OPERATIONS,
  createTaskForProject,
  isTaskStatusTransitionPayload,
  moveTaskStatusForProject,
  updateTaskForProject,
  validateTaskCreateFieldTypes,
  type CreateTaskForProjectInput,
  type TaskStatusTransitionPayload,
  type UpdateTaskPayload,
  type UpdatedTaskPayload,
} from "@/lib/services/project-task-service";
import { requireAgentProjectScopes } from "@/lib/services/project-access-service";

interface BulkCreateOperation {
  type: "create";
  task: {
    title?: unknown;
    description?: unknown;
    deadlineDate?: unknown;
    epicId?: unknown;
    assigneeUserId?: unknown;
    labels?: unknown;
    relatedTaskIds?: unknown;
    attachmentLinks?: unknown;
  };
}

interface BulkUpdateOperation {
  type: "update";
  taskId: string;
  changes: UpdateTaskPayload;
}

interface BulkStatusOperation {
  type: "status";
  taskId: string;
  status: TaskStatusTransitionPayload["status"];
  position?: number;
}

type BulkOperation = BulkCreateOperation | BulkUpdateOperation | BulkStatusOperation;

interface BulkResult {
  index: number;
  ok: boolean;
  status: number;
  taskId?: string;
  task?: UpdatedTaskPayload;
  error?: string;
}

function serializeJsonField(value: unknown): string {
  if (value == null) {
    return "";
  }
  if (typeof value === "string") {
    return value.trim();
  }
  return JSON.stringify(value);
}

function isBulkCreateOperation(operation: BulkOperation): operation is BulkCreateOperation {
  return (
    operation.type === "create" &&
    !!operation.task &&
    typeof operation.task === "object" &&
    typeof operation.task.title === "string" &&
    operation.task.title.trim().length > 0
  );
}

function isBulkUpdateOperation(operation: BulkOperation): operation is BulkUpdateOperation {
  return (
    operation.type === "update" &&
    typeof operation.taskId === "string" &&
    operation.taskId.trim().length > 0 &&
    !!operation.changes &&
    typeof operation.changes === "object" &&
    !Array.isArray(operation.changes)
  );
}

function isBulkStatusOperation(operation: BulkOperation): operation is BulkStatusOperation {
  return (
    operation.type === "status" &&
    typeof operation.taskId === "string" &&
    operation.taskId.trim().length > 0 &&
    isTaskStatusTransitionPayload({
      status: operation.status,
      position: operation.position,
    })
  );
}

function isValidBulkOperation(operation: unknown): operation is BulkOperation {
  if (!operation || typeof operation !== "object") {
    return false;
  }

  const candidate = operation as BulkOperation;
  return (
    isBulkCreateOperation(candidate) ||
    isBulkUpdateOperation(candidate) ||
    isBulkStatusOperation(candidate)
  );
}

function parseBulkOperations(body: unknown): BulkOperation[] | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const maybeOperations = (body as { operations?: unknown }).operations;
  if (!Array.isArray(maybeOperations) || maybeOperations.length === 0) {
    return null;
  }

  if (maybeOperations.length > MAX_BULK_TASK_OPERATIONS) {
    return null;
  }

  return maybeOperations.every(isValidBulkOperation)
    ? (maybeOperations as BulkOperation[])
    : null;
}

function buildCreateInput(
  operation: BulkCreateOperation,
  actorUserId: string,
  projectId: string,
  agentAccess: ReturnType<typeof getAgentProjectAccessContext>
): CreateTaskForProjectInput {
  const task = operation.task;
  return {
    actorUserId,
    projectId,
    title: typeof task.title === "string" ? task.title.trim() : "",
    description: typeof task.description === "string" ? task.description.trim() : "",
    deadlineDate: typeof task.deadlineDate === "string" ? task.deadlineDate.trim() : "",
    epicId: typeof task.epicId === "string" ? task.epicId.trim() || null : null,
    assigneeUserId:
      typeof task.assigneeUserId === "string"
        ? task.assigneeUserId.trim() || null
        : null,
    labelsJsonRaw: serializeJsonField(task.labels),
    relatedTaskIdsJsonRaw: serializeJsonField(task.relatedTaskIds),
    attachmentLinksJsonRaw: serializeJsonField(task.attachmentLinks),
    attachmentFiles: [],
    agentAccess,
  };
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

  const operations = parseBulkOperations(body);
  if (!operations) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const results: BulkResult[] = [];

  for (const [index, operation] of operations.entries()) {
    if (operation.type === "create") {
      const fieldTypeError = validateTaskCreateFieldTypes(operation.task);
      if (fieldTypeError) {
        results.push({ index, ok: false, status: 400, error: fieldTypeError });
        continue;
      }

      const result = await createTaskForProject(
        buildCreateInput(operation, actorUserId, projectId, agentAccess)
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
        status: 201,
        taskId: rawTask.id,
        task,
      });
      continue;
    }

    if (operation.type === "update") {
      const result = await updateTaskForProject(
        projectId,
        operation.taskId,
        operation.changes,
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
