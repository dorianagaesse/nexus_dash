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
import {
  createTaskForProject,
  parseTaskAssigneeInput,
  validateTaskCreateFieldTypes,
} from "@/lib/services/project-task-service";
import { requireAgentProjectScopes } from "@/lib/services/project-access-service";
import { mapProjectKanbanTaskToTaskResponse } from "@/lib/services/project-task-response";
import type { ProjectActorReference } from "@/lib/project-actor";

const ATTACHMENT_FILES_FIELD = "attachmentFiles";

interface TaskCreateJsonRequestBody {
  title?: unknown;
  description?: unknown;
  deadlineDate?: unknown;
  epicId?: unknown;
  assigneeUserId?: unknown;
  assignee?: unknown;
  labels?: unknown;
  relatedTaskIds?: unknown;
  attachmentLinks?: unknown;
}

function readText(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function readAttachmentFiles(formData: FormData): File[] {
  return formData
    .getAll(ATTACHMENT_FILES_FIELD)
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
}

function isJsonRequest(request: NextRequest): boolean {
  return request.headers.get("content-type")?.includes("application/json") ?? false;
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

  let title = "";
  let description = "";
  let deadlineDate = "";
  let epicId: string | null = null;
  let assignee: ProjectActorReference | null = null;
  let labelsJsonRaw = "";
  let relatedTaskIdsJsonRaw = "";
  let attachmentLinksJsonRaw = "";
  let attachmentFiles: File[] = [];

  if (isJsonRequest(request)) {
    let payload: TaskCreateJsonRequestBody;
    try {
      payload = (await request.json()) as TaskCreateJsonRequestBody;
    } catch (error) {
      logServerWarning(
        "POST /api/projects/:projectId/tasks.invalidJson",
        "Invalid JSON payload",
        { error }
      );
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    title = typeof payload.title === "string" ? payload.title.trim() : "";
    description =
      typeof payload.description === "string" ? payload.description.trim() : "";
    const fieldTypeError = validateTaskCreateFieldTypes(payload);
    if (fieldTypeError) {
      return NextResponse.json({ error: fieldTypeError }, { status: 400 });
    }
    deadlineDate =
      typeof payload.deadlineDate === "string" ? payload.deadlineDate.trim() : "";
    epicId = typeof payload.epicId === "string" ? payload.epicId.trim() || null : null;
    assignee = parseTaskAssigneeInput(payload);
    labelsJsonRaw = serializeJsonField(payload.labels);
    relatedTaskIdsJsonRaw = serializeJsonField(payload.relatedTaskIds);
    attachmentLinksJsonRaw = serializeJsonField(payload.attachmentLinks);
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

    title = readText(formData, "title");
    description = readText(formData, "description");
    deadlineDate = readText(formData, "deadlineDate");
    epicId = readText(formData, "epicId") || null;
    const assigneeKindField = readText(formData, "assigneeKind");
    const assigneeIdField = readText(formData, "assigneeId");
    assignee = parseTaskAssigneeInput({
      assignee:
        assigneeKindField || assigneeIdField
          ? {
              kind: assigneeKindField,
              id: assigneeIdField,
            }
          : undefined,
      assigneeUserId: readText(formData, "assigneeUserId"),
    });
    if ((assigneeKindField || assigneeIdField) && !assignee) {
      return NextResponse.json({ error: "assignee-invalid" }, { status: 400 });
    }
    labelsJsonRaw = readText(formData, "labels");
    relatedTaskIdsJsonRaw = readText(formData, "relatedTaskIds");
    attachmentLinksJsonRaw = readText(formData, "attachmentLinks");
    attachmentFiles = readAttachmentFiles(formData);

    if (principalResult.principal.kind === "agent" && attachmentFiles.length > 0) {
      return NextResponse.json(
        { error: "agent-file-attachments-not-supported" },
        { status: 400 }
      );
    }
  }

  const result = await createTaskForProject({
    actorUserId,
    projectId,
    title,
    description,
    deadlineDate,
    epicId,
    assignee,
    labelsJsonRaw,
    relatedTaskIdsJsonRaw,
    attachmentLinksJsonRaw,
    attachmentFiles,
    agentAccess,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
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
