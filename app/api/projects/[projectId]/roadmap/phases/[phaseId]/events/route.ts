import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedApiUser } from "@/lib/auth/api-guard";
import { logServerWarning } from "@/lib/observability/logger";
import { createProjectRoadmapEvent } from "@/lib/services/project-roadmap-service";

interface RoadmapEventRequestBody {
  title?: unknown;
  description?: unknown;
  targetDate?: unknown;
  status?: unknown;
}

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ projectId: string; phaseId: string }> }
) {
  const params = await props.params;
  const authenticatedUser = await requireAuthenticatedApiUser(request);
  if (!authenticatedUser.ok) {
    return authenticatedUser.response;
  }

  let payload: RoadmapEventRequestBody;
  try {
    payload = (await request.json()) as RoadmapEventRequestBody;
  } catch (error) {
    logServerWarning(
      "POST /api/projects/:projectId/roadmap/phases/:phaseId/events.invalidJson",
      "Invalid JSON payload",
      { error }
    );
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  const result = await createProjectRoadmapEvent({
    actorUserId: authenticatedUser.userId,
    projectId: params.projectId,
    phaseId: params.phaseId,
    title: typeof payload.title === "string" ? payload.title : "",
    description: typeof payload.description === "string" ? payload.description : null,
    targetDate: typeof payload.targetDate === "string" ? payload.targetDate : null,
    status: typeof payload.status === "string" ? payload.status : null,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(
    {
      event: result.data.event,
      phase: result.data.phase,
    },
    { status: 201 }
  );
}
