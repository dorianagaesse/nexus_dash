import { NextRequest, NextResponse } from "next/server";

import {
  getAgentProjectAccessContext,
  requireApiPrincipal,
} from "@/lib/auth/api-guard";
import { logServerWarning } from "@/lib/observability/logger";
import { listProjectKanbanTasks } from "@/lib/services/project-service";
import { createTaskForProject } from "@/lib/services/project-task-service";
import { requireAgentProjectScopes } from "@/lib/services/project-access-service";

const ATTACHMENT_FILES_FIELD = "attachmentFiles";

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

function mapRelatedTasks(task: {
  outgoingRelations: Array<{
    rightTask: {
      id: string;
      title: string;
      status: string;
      archivedAt: Date | null;
    };
  }>;
  incomingRelations: Array<{
    leftTask: {
      id: string;
      title: string;
      status: string;
      archivedAt: Date | null;
    };
  }>;
}) {
  return [
    ...task.outgoingRelations.map((relation) => relation.rightTask),
    ...task.incomingRelations.map((relation) => relation.leftTask),
  ].sort((left, right) => left.title.localeCompare(right.title));
}

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
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

  const tasks = await listProjectKanbanTasks(
    params.projectId,
    principalResult.principal.actorUserId,
    agentAccess
  );

  return NextResponse.json({
    tasks: tasks.map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      blockedNote: task.blockedNote,
      completedAt: task.completedAt,
      archivedAt: task.archivedAt,
      status: task.status,
      position: task.position,
      label: task.label,
      labelsJson: task.labelsJson,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      relatedTasks: mapRelatedTasks(task),
      blockedFollowUps: task.blockedFollowUps,
    })),
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
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

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (error) {
    logServerWarning("POST /api/projects/:projectId/tasks.invalidForm", "Invalid form payload", {
      error,
    });
    return NextResponse.json({ error: "Invalid form payload" }, { status: 400 });
  }

  const attachmentFiles = readAttachmentFiles(formData);
  if (
    principalResult.principal.kind === "agent" &&
    attachmentFiles.length > 0
  ) {
    return NextResponse.json(
      { error: "agent-file-attachments-not-supported" },
      { status: 400 }
    );
  }

  const result = await createTaskForProject({
    actorUserId,
    projectId,
    title: readText(formData, "title"),
    description: readText(formData, "description"),
    labelsJsonRaw: readText(formData, "labels"),
    relatedTaskIdsJsonRaw: readText(formData, "relatedTaskIds"),
    attachmentLinksJsonRaw: readText(formData, "attachmentLinks"),
    attachmentFiles,
    agentAccess,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ taskId: result.data.id }, { status: 201 });
}
