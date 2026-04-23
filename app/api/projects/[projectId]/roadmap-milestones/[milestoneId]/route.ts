import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedApiUser } from "@/lib/auth/api-guard";
import { logServerWarning } from "@/lib/observability/logger";
import {
  deleteProjectRoadmapMilestone,
  updateProjectRoadmapMilestone,
} from "@/lib/services/project-roadmap-service";

interface RoadmapMilestoneRequestBody {
  title?: unknown;
  description?: unknown;
  targetDate?: unknown;
  status?: unknown;
}

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ projectId: string; milestoneId: string }> }
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
      "PATCH /api/projects/:projectId/roadmap-milestones/:milestoneId.invalidJson",
      "Invalid JSON payload",
      { error }
    );
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  const result = await updateProjectRoadmapMilestone({
    actorUserId: authenticatedUser.userId,
    projectId: params.projectId,
    milestoneId: params.milestoneId,
    ...(Object.prototype.hasOwnProperty.call(payload, "title")
      ? { title: typeof payload.title === "string" ? payload.title : "" }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(payload, "description")
      ? {
          description:
            typeof payload.description === "string" ? payload.description : null,
        }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(payload, "targetDate")
      ? {
          targetDate:
            typeof payload.targetDate === "string" ? payload.targetDate : null,
        }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(payload, "status")
      ? {
          status: typeof payload.status === "string" ? payload.status : null,
        }
      : {}),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    milestone: result.data.milestone,
  });
}

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ projectId: string; milestoneId: string }> }
) {
  const params = await props.params;
  const authenticatedUser = await requireAuthenticatedApiUser(request);
  if (!authenticatedUser.ok) {
    return authenticatedUser.response;
  }

  const result = await deleteProjectRoadmapMilestone({
    actorUserId: authenticatedUser.userId,
    projectId: params.projectId,
    milestoneId: params.milestoneId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true });
}
