import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedApiUser } from "@/lib/auth/api-guard";
import { createRouteTimer } from "@/lib/observability/server-timing";
import {
  deleteProject,
  getProjectMutationPayloadById,
  updateProject,
} from "@/lib/services/project-service";

const MIN_PROJECT_NAME_LENGTH = 2;

interface UpdateProjectRequestBody {
  name?: unknown;
  description?: unknown;
}

function readTrimmedString(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function mapProjectMutationError(error: unknown): {
  status: number;
  code: string;
} {
  const message =
    error instanceof Error ? error.message.trim().toLowerCase() : "update-failed";

  if (message === "unauthorized") {
    return { status: 401, code: "unauthorized" };
  }

  if (message === "project-not-found") {
    return { status: 404, code: "project-not-found" };
  }

  if (message === "forbidden") {
    return { status: 403, code: "forbidden" };
  }

  return { status: 500, code: "update-failed" };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const timer = createRouteTimer("PATCH /api/projects/:projectId", request);
  const authenticatedUser = await timer.measure("auth", () =>
    requireAuthenticatedApiUser(request)
  );
  if (!authenticatedUser.ok) {
    return timer.finalize({ response: authenticatedUser.response });
  }
  const actorUserId = authenticatedUser.userId;
  const projectId = readTrimmedString(params.projectId);

  if (!projectId) {
    return timer.finalize({
      response: NextResponse.json({ error: "missing-project-id" }, { status: 400 }),
    });
  }

  let payload: UpdateProjectRequestBody;
  try {
    payload = await timer.measure("parse", () =>
      request.json() as Promise<UpdateProjectRequestBody>
    );
  } catch (_error) {
    return timer.finalize({
      response: NextResponse.json({ error: "invalid-json" }, { status: 400 }),
    });
  }

  const name = readTrimmedString(payload.name);
  const description = readTrimmedString(payload.description);

  if (name.length < MIN_PROJECT_NAME_LENGTH) {
    return timer.finalize({
      response: NextResponse.json({ error: "name-too-short" }, { status: 400 }),
    });
  }

  try {
    await timer.measure("service:update", () =>
      updateProject({
        actorUserId,
        projectId,
        name,
        description: description.length > 0 ? description : null,
      })
    );

    const project = await timer.measure("service:read", () =>
      getProjectMutationPayloadById({
        actorUserId,
        projectId,
      })
    );

    if (!project) {
      return timer.finalize({
        response: NextResponse.json({ error: "project-not-found" }, { status: 404 }),
      });
    }

    return timer.finalize({
      response: NextResponse.json({ project }),
    });
  } catch (error) {
    const mapped = mapProjectMutationError(error);
    return timer.finalize({
      response: NextResponse.json({ error: mapped.code }, { status: mapped.status }),
    });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const timer = createRouteTimer("DELETE /api/projects/:projectId", request);
  const authenticatedUser = await timer.measure("auth", () =>
    requireAuthenticatedApiUser(request)
  );
  if (!authenticatedUser.ok) {
    return timer.finalize({ response: authenticatedUser.response });
  }
  const actorUserId = authenticatedUser.userId;
  const projectId = readTrimmedString(params.projectId);

  if (!projectId) {
    return timer.finalize({
      response: NextResponse.json({ error: "missing-project-id" }, { status: 400 }),
    });
  }

  try {
    await timer.measure("service:delete", () =>
      deleteProject({ actorUserId, projectId })
    );

    return timer.finalize({
      response: NextResponse.json({ ok: true }),
    });
  } catch (error) {
    const mapped = mapProjectMutationError(error);
    return timer.finalize({
      response: NextResponse.json({ error: mapped.code }, { status: mapped.status }),
    });
  }
}
