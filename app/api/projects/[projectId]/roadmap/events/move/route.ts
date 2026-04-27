import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedApiUser } from "@/lib/auth/api-guard";
import { logServerWarning } from "@/lib/observability/logger";
import {
  isValidRoadmapEventMovePayload,
  moveProjectRoadmapEvent,
} from "@/lib/services/project-roadmap-service";

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ projectId: string }> }
) {
  const params = await props.params;
  const authenticatedUser = await requireAuthenticatedApiUser(request);
  if (!authenticatedUser.ok) {
    return authenticatedUser.response;
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch (error) {
    logServerWarning(
      "POST /api/projects/:projectId/roadmap/events/move.invalidJson",
      "Invalid JSON payload",
      { error }
    );
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  if (!isValidRoadmapEventMovePayload(payload)) {
    return NextResponse.json({ error: "invalid-payload" }, { status: 400 });
  }

  const result = await moveProjectRoadmapEvent({
    actorUserId: authenticatedUser.userId,
    projectId: params.projectId,
    eventId: payload.eventId,
    targetPhaseId: payload.targetPhaseId,
    targetIndex: payload.targetIndex,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true });
}
