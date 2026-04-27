import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedApiUser } from "@/lib/auth/api-guard";
import { logServerWarning } from "@/lib/observability/logger";
import {
  deleteProjectRoadmapEvent,
  updateProjectRoadmapEvent,
} from "@/lib/services/project-roadmap-service";

interface RoadmapEventRequestBody {
  title?: unknown;
  description?: unknown;
  targetDate?: unknown;
  status?: unknown;
}

function hasOwn(payload: RoadmapEventRequestBody, key: keyof RoadmapEventRequestBody) {
  return Object.prototype.hasOwnProperty.call(payload, key);
}

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ projectId: string; eventId: string }> }
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
      "PATCH /api/projects/:projectId/roadmap/events/:eventId.invalidJson",
      "Invalid JSON payload",
      { error }
    );
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  if (hasOwn(payload, "title") && typeof payload.title !== "string") {
    return NextResponse.json({ error: "invalid-payload" }, { status: 400 });
  }
  if (
    hasOwn(payload, "description") &&
    payload.description !== null &&
    typeof payload.description !== "string"
  ) {
    return NextResponse.json({ error: "invalid-payload" }, { status: 400 });
  }
  if (
    hasOwn(payload, "targetDate") &&
    payload.targetDate !== null &&
    typeof payload.targetDate !== "string"
  ) {
    return NextResponse.json({ error: "invalid-payload" }, { status: 400 });
  }
  if (
    hasOwn(payload, "status") &&
    payload.status !== null &&
    typeof payload.status !== "string"
  ) {
    return NextResponse.json({ error: "invalid-payload" }, { status: 400 });
  }

  const result = await updateProjectRoadmapEvent({
    actorUserId: authenticatedUser.userId,
    projectId: params.projectId,
    eventId: params.eventId,
    ...(hasOwn(payload, "title") ? { title: payload.title as string } : {}),
    ...(hasOwn(payload, "description")
      ? { description: (payload.description ?? null) as string | null }
      : {}),
    ...(hasOwn(payload, "targetDate")
      ? { targetDate: (payload.targetDate ?? null) as string | null }
      : {}),
    ...(hasOwn(payload, "status")
      ? { status: (payload.status ?? null) as string | null }
      : {}),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    event: result.data.event,
    phase: result.data.phase,
  });
}

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ projectId: string; eventId: string }> }
) {
  const params = await props.params;
  const authenticatedUser = await requireAuthenticatedApiUser(request);
  if (!authenticatedUser.ok) {
    return authenticatedUser.response;
  }

  const result = await deleteProjectRoadmapEvent({
    actorUserId: authenticatedUser.userId,
    projectId: params.projectId,
    eventId: params.eventId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    phaseId: result.data.phaseId,
  });
}
