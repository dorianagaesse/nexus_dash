import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedApiUser } from "@/lib/auth/api-guard";
import { logServerWarning } from "@/lib/observability/logger";
import {
  createProject,
  listProjectsWithCounts,
} from "@/lib/services/project-service";

interface CreateProjectRequestBody {
  name?: unknown;
  description?: unknown;
}

const MIN_PROJECT_NAME_LENGTH = 2;

function serializeProject(
  project: Awaited<ReturnType<typeof listProjectsWithCounts>>[number],
  actorUserId: string
) {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    ownerId: project.ownerId,
    role:
      project.ownerId === actorUserId
        ? "owner"
        : project.memberships[0]?.role ?? "viewer",
    updatedAt: project.updatedAt.toISOString(),
    counts: {
      tasks: project._count.tasks,
      contextCards: project._count.resources,
    },
  };
}

function serializeCreatedProject(project: Awaited<ReturnType<typeof createProject>>) {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    ownerId: project.ownerId,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

export async function GET(request: NextRequest) {
  const authenticatedUser = await requireAuthenticatedApiUser(request);
  if (!authenticatedUser.ok) {
    return authenticatedUser.response;
  }

  const projects = await listProjectsWithCounts(authenticatedUser.userId);

  return NextResponse.json({
    projects: projects.map((project) =>
      serializeProject(project, authenticatedUser.userId)
    ),
  });
}

export async function POST(request: NextRequest) {
  const authenticatedUser = await requireAuthenticatedApiUser(request);
  if (!authenticatedUser.ok) {
    return authenticatedUser.response;
  }

  let payload: CreateProjectRequestBody;
  try {
    payload = (await request.json()) as CreateProjectRequestBody;
  } catch (error) {
    logServerWarning("POST /api/projects.invalidJson", "Invalid JSON payload", {
      error,
    });
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  if (name.length < MIN_PROJECT_NAME_LENGTH) {
    return NextResponse.json({ error: "name-too-short" }, { status: 400 });
  }

  try {
    const project = await createProject({
      actorUserId: authenticatedUser.userId,
      name,
      description:
        typeof payload.description === "string" && payload.description.trim().length > 0
          ? payload.description.trim()
          : null,
    });

    return NextResponse.json(
      { project: serializeCreatedProject(project) },
      { status: 201 }
    );
  } catch (error) {
    if (
      error instanceof Error &&
      ["unauthorized", "project-name-required"].includes(error.message)
    ) {
      const status = error.message === "unauthorized" ? 401 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }

    throw error;
  }
}
