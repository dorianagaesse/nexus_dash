import { NextRequest, NextResponse } from "next/server";

import {
  deleteCalendarEvent,
  updateCalendarEvent,
} from "@/lib/services/calendar-service";
import { getActorHeaderUserId } from "@/lib/request-actor";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { eventId: string } }
) {
  const eventId = params.eventId;
  if (!eventId) {
    return NextResponse.json({ error: "missing-event-id" }, { status: 400 });
  }

  const actorUserId = getActorHeaderUserId(request.headers);
  const projectId = request.nextUrl.searchParams.get("projectId");
  const rawBody = (await request.json().catch(() => null)) as unknown;
  const serviceBody =
    rawBody && typeof rawBody === "object"
      ? {
          ...rawBody,
          projectId,
          actorUserId,
        }
      : rawBody;
  const result = await updateCalendarEvent(eventId, serviceBody);

  return NextResponse.json(result.body, { status: result.status });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { eventId: string } }
) {
  const eventId = params.eventId;
  if (!eventId) {
    return NextResponse.json({ error: "missing-event-id" }, { status: 400 });
  }

  const actorUserId = getActorHeaderUserId(request.headers);
  const projectId = request.nextUrl.searchParams.get("projectId");
  const result = await deleteCalendarEvent(eventId, {
    projectId,
    actorUserId,
  });
  return NextResponse.json(result.body, { status: result.status });
}
