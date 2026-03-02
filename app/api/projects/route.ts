import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedApiUser } from "@/lib/auth/api-guard";
import { createRouteTimer } from "@/lib/observability/server-timing";
import {
  createProject,
  getProjectMutationPayloadById,
} from "@/lib/services/project-service";

const MIN_PROJECT_NAME_LENGTH = 2;

interface CreateProjectRequestBody {
  name?: unknown;
  description?: unknown;
}

function readTrimmedString(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

export async function POST(request: NextRequest) {
  const timer = createRouteTimer("POST /api/projects", request);
  const authenticatedUser = await timer.measure("auth", () =>
    requireAuthenticatedApiUser(request)
  );
  if (!authenticatedUser.ok) {
    return timer.finalize({ response: authenticatedUser.response });
  }
  const actorUserId = authenticatedUser.userId;

  let payload: CreateProjectRequestBody;
  try {
    payload = await timer.measure("parse", () =>
      request.json() as Promise<CreateProjectRequestBody>
    );
  } catch (_error) {
    return timer.finalize({
      response: NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 }),
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
    const createdProject = await timer.measure("service:create", () =>
      createProject({
        actorUserId,
        name,
        description: description.length > 0 ? description : null,
      })
    );

    const project = await timer.measure("service:read", () =>
      getProjectMutationPayloadById({
        actorUserId,
        projectId: createdProject.id,
      })
    );

    if (!project) {
      return timer.finalize({
        response: NextResponse.json({ error: "project-not-found" }, { status: 404 }),
      });
    }

    return timer.finalize({
      response: NextResponse.json({ project }, { status: 201 }),
    });
  } catch (_error) {
    return timer.finalize({
      response: NextResponse.json({ error: "create-failed" }, { status: 500 }),
    });
  }
}
