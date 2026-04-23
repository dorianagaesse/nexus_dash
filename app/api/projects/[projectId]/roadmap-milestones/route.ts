import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedApiUser } from "@/lib/auth/api-guard";
import { logServerWarning } from "@/lib/observability/logger";
import {
  createProjectRoadmapMilestone,
  listProjectRoadmapMilestones,
} from "@/lib/services/project-roadmap-service";

interface RoadmapMilestoneRequestBody {
  title?: unknown;
  description?: unknown;
  targetDate?: unknown;
  status?: unknown;
}

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ projectId: string }> }
) {
  const params = await props.params;
  const authenticatedUser = await requireAuthenticatedApiUser(request);
  if (!authenticatedUser.ok) {
    return authenticatedUser.response;
  }

  const milestones = await listProjectRoadmapMilestones(
    params.projectId,
    authenticatedUser.userId
  );

  return NextResponse.json({
    milestones,
  });
}

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ projectId: string }> }
) {
  const params = await props.params;
  const authenticatedUser = await requireAuthenticatedApiUser(request);
  if (!authenticatedUser.ok) {
    return authenticatedUser.response;
  }

  let payload: RoadmapMilestoneRequestBody;
  try {
    payload = (await request.json()) as RoadmapMilestoneRequestBody;
  } catch (error) {
    logServerWarning(
      "POST /api/projects/:projectId/roadmap-milestones.invalidJson",
      "Invalid JSON payload",
      { error }
    );
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  const result = await createProjectRoadmapMilestone({
    actorUserId: authenticatedUser.userId,
    projectId: params.projectId,
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
      milestone: result.data.milestone,
    },
    { status: 201 }
  );
}
