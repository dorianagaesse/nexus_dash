import { NextRequest, NextResponse } from "next/server";

import {
  getAgentProjectAccessContext,
  requireApiPrincipal,
  requireAuthenticatedApiUser,
} from "@/lib/auth/api-guard";
import { logServerWarning } from "@/lib/observability/logger";
import {
  requireAgentProjectScopes,
} from "@/lib/services/project-access-service";
import { deleteProject, getProjectSummaryById, updateProject } from "@/lib/services/project-service";

interface UpdateProjectRequestBody {
  name?: unknown;
  description?: unknown;
}

const MIN_PROJECT_NAME_LENGTH = 2;

export async function GET(request: NextRequest, props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  const principalResult = await requireApiPrincipal(request);
  if (!principalResult.ok) {
    return principalResult.response;
  }

  const agentAccess = getAgentProjectAccessContext(principalResult.principal);
  const agentScopeAccess = requireAgentProjectScopes({
    agentAccess,
    projectId: params.projectId,
    requiredScopes: ["project:read"],
  });
  if (!agentScopeAccess.ok) {
    return NextResponse.json(
      { error: agentScopeAccess.error },
      { status: agentScopeAccess.status }
    );
  }

  const project = await getProjectSummaryById(
    params.projectId,
    principalResult.principal.actorUserId,
    agentAccess
  );
  if (!project) {
    return NextResponse.json({ error: "project-not-found" }, { status: 404 });
  }

  return NextResponse.json({
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
      stats: {
        trackedTasks: project.stats.trackedTasks,
        openTasks: project.stats.openTasks,
        completedTasks: project.stats.completedTasks,
        contextCards: project.stats.contextCards,
      },
    },
  });
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  const authenticatedUser = await requireAuthenticatedApiUser(request);
  if (!authenticatedUser.ok) {
    return authenticatedUser.response;
  }

  let payload: UpdateProjectRequestBody;
  try {
    payload = (await request.json()) as UpdateProjectRequestBody;
  } catch (error) {
    logServerWarning("PATCH /api/projects/:projectId.invalidJson", "Invalid JSON payload", {
      error,
    });
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  try {
    const name = typeof payload.name === "string" ? payload.name.trim() : "";

    if (name.length < MIN_PROJECT_NAME_LENGTH) {
      return NextResponse.json({ error: "name-too-short" }, { status: 400 });
    }

    const project = await updateProject({
      actorUserId: authenticatedUser.userId,
      projectId: params.projectId,
      name,
      description:
        typeof payload.description === "string" && payload.description.trim().length > 0
          ? payload.description.trim()
          : null,
    });

    return NextResponse.json({ project });
  } catch (error) {
    if (
      error instanceof Error &&
      ["unauthorized", "project-not-found", "forbidden"].includes(error.message)
    ) {
      const status =
        error.message === "unauthorized"
          ? 401
          : error.message === "project-not-found"
            ? 404
            : 403;
      return NextResponse.json({ error: error.message }, { status });
    }

    throw error;
  }
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  const authenticatedUser = await requireAuthenticatedApiUser(request);
  if (!authenticatedUser.ok) {
    return authenticatedUser.response;
  }

  try {
    await deleteProject({
      actorUserId: authenticatedUser.userId,
      projectId: params.projectId,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (
      error instanceof Error &&
      ["unauthorized", "project-not-found", "forbidden"].includes(error.message)
    ) {
      const status =
        error.message === "unauthorized"
          ? 401
          : error.message === "project-not-found"
            ? 404
            : 403;
      return NextResponse.json({ error: error.message }, { status });
    }

    throw error;
  }
}
