import { NextRequest, NextResponse } from "next/server";

import {
  getAgentProjectAccessContext,
  requireApiPrincipal,
} from "@/lib/auth/api-guard";
import { logServerWarning } from "@/lib/observability/logger";
import { startServerTiming } from "@/lib/observability/server-timing";
import { withProjectActivityVersionHeader } from "@/lib/project-activity-version";
import { mapTaskAttachmentResponse } from "@/lib/services/project-attachment-service";
import { loadProjectActorRegistryForActor } from "@/lib/services/project-actor-service";
import {
  listProjectKanbanTasks,
  type TaskListAssigneeFilter,
} from "@/lib/services/project-service";
import { createTaskForProject } from "@/lib/services/project-task-service";
import { requireAgentProjectScopes } from "@/lib/services/project-access-service";
import { mapProjectKanbanTaskToTaskResponse } from "@/lib/services/project-task-response";
import {
  parseCreateTaskJsonInput,
  parseCreateTaskMultipartInput,
  toCreateTaskServiceInput,
} from "@/lib/task-contracts";

function isJsonRequest(request: NextRequest): boolean {
  return request.headers.get("content-type")?.includes("application/json") ?? false;
}

export async function GET(request: NextRequest, props: { params: Promise<{ projectId: string }> }) {
  const timing = startServerTiming("tasks.list");
  const params = await props.params;
  const principalResult = await requireApiPrincipal(request);
  if (!principalResult.ok) {
    return principalResult.response;
  }

  const agentAccess = getAgentProjectAccessContext(principalResult.principal);
  const agentScopeAccess = requireAgentProjectScopes({
    agentAccess,
    projectId: params.projectId,
    requiredScopes: ["task:read"],
  });
  if (!agentScopeAccess.ok) {
    return NextResponse.json(
      { error: agentScopeAccess.error },
      { status: agentScopeAccess.status }
    );
  }

  const epicIdFilter = request.nextUrl.searchParams.get("epicId")?.trim() || null;
  const labelFilter = request.nextUrl.searchParams.get("label")?.trim() || null;
  const assigneeParam = request.nextUrl.searchParams.get("assignee")?.trim() || null;
  if (assigneeParam && assigneeParam !== "self" && assigneeParam !== "unassigned") {
    return NextResponse.json({ error: "invalid-assignee" }, { status: 400 });
  }

  const sortParam = request.nextUrl.searchParams.get("sort")?.trim() || null;
  if (sortParam && sortParam !== "recent") {
    return NextResponse.json({ error: "invalid-sort" }, { status: 400 });
  }

  const limitParam = request.nextUrl.searchParams.get("limit")?.trim() || null;
  let limitFilter: number | null = null;
  if (limitParam) {
    const parsedLimit = Number.parseInt(limitParam, 10);
    if (!Number.isFinite(parsedLimit)) {
      return NextResponse.json({ error: "invalid-limit" }, { status: 400 });
    }
    limitFilter = Math.min(Math.max(parsedLimit, 1), 200);
  }

  const assigneeFilter: TaskListAssigneeFilter | undefined =
    assigneeParam === "unassigned"
      ? "unassigned"
      : assigneeParam === "self"
        ? principalResult.principal.kind === "agent"
          ? { kind: "agent", id: principalResult.principal.credentialId }
          : { kind: "human", id: principalResult.principal.actorUserId }
        : undefined;

  const filters =
    epicIdFilter || labelFilter || assigneeFilter || sortParam || limitFilter
      ? {
          ...(epicIdFilter ? { epicId: epicIdFilter } : {}),
          ...(labelFilter ? { label: labelFilter } : {}),
          ...(assigneeFilter ? { assignee: assigneeFilter } : {}),
          ...(sortParam === "recent" ? { sort: "recent" as const } : {}),
          ...(limitFilter !== null ? { limit: limitFilter } : {}),
        }
      : undefined;

  const [tasks, actorRegistry] = await Promise.all([
    listProjectKanbanTasks(
      params.projectId,
      principalResult.principal.actorUserId,
      agentAccess,
      filters
    ),
    loadProjectActorRegistryForActor({
      actorUserId: principalResult.principal.actorUserId,
      projectId: params.projectId,
    }),
  ]);

  return NextResponse.json(
    {
      filters: {
        epicId: epicIdFilter,
        label: labelFilter,
        assignee: assigneeParam,
        sort: sortParam,
        limit: limitFilter,
      },
      tasks: tasks.map((task) =>
        mapProjectKanbanTaskToTaskResponse(task, params.projectId, actorRegistry)
      ),
    },
    { headers: timing.headers() }
  );
}

export async function POST(request: NextRequest, props: { params: Promise<{ projectId: string }> }) {
  const timing = startServerTiming("task.create");
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

  let parsedCreate: ReturnType<typeof parseCreateTaskJsonInput>;

  if (isJsonRequest(request)) {
    let payload: unknown;
    try {
      payload = await request.json();
    } catch (error) {
      logServerWarning(
        "POST /api/projects/:projectId/tasks.invalidJson",
        "Invalid JSON payload",
        { error }
      );
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    parsedCreate = parseCreateTaskJsonInput(payload);
  } else {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (error) {
      logServerWarning(
        "POST /api/projects/:projectId/tasks.invalidForm",
        "Invalid form payload",
        { error }
      );
      return NextResponse.json({ error: "Invalid form payload" }, { status: 400 });
    }

    parsedCreate = parseCreateTaskMultipartInput(formData, {
      isAgentRequest: principalResult.principal.kind === "agent",
    });
  }

  if (!parsedCreate.ok) {
    return NextResponse.json(
      { error: parsedCreate.error },
      { status: 400, headers: timing.headers() }
    );
  }

  const result = await createTaskForProject(
    toCreateTaskServiceInput(parsedCreate.data, {
      actorUserId,
      projectId,
      agentAccess,
    })
  );

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        ...(result.invalidRelatedTask ? { invalidRelatedTask: result.invalidRelatedTask } : {}),
      },
      { status: result.status, headers: timing.headers() }
    );
  }

  const resultData = result.data as {
    id?: string;
    task?: typeof result.data.task;
    activityVersion: Date;
  };
  const task = resultData.task ?? null;

  // Defensive legacy fallback: the service contract always returns the full
  // created task, so this branch is unreachable in practice and kept only so
  // a payload-shaped regression still yields a usable taskId.
  if (!task) {
    return NextResponse.json(
      { taskId: resultData.id },
      {
        status: 201,
        headers: withProjectActivityVersionHeader(
          timing.headers(),
          resultData.activityVersion
        ),
      }
    );
  }

  const responseTask = {
    ...task,
    attachments: task.attachments.map((attachment) =>
      mapTaskAttachmentResponse(projectId, task.id, attachment)
    ),
  };
  return NextResponse.json(
    {
      taskId: task.id,
      task: responseTask,
    },
    {
      status: 201,
      headers: withProjectActivityVersionHeader(
        timing.headers(),
        result.data.activityVersion
      ),
    }
  );
}
