import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedApiUser } from "@/lib/auth/api-guard";
import {
  deleteCalendarEvent,
  updateCalendarEvent,
} from "@/lib/services/calendar-service";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { eventId: string } }
) {
  const authenticatedUser = await requireAuthenticatedApiUser(request);
  if (!authenticatedUser.ok) {
    return authenticatedUser.response;
  }
  const actorUserId = authenticatedUser.userId;
  const eventId = params.eventId;
  if (!eventId) {
    return NextResponse.json({ error: "missing-event-id" }, { status: 400 });
  }

  const rawBody = (await request.json().catch(() => null)) as unknown;
  const result = await updateCalendarEvent(eventId, rawBody, actorUserId);

  return NextResponse.json(result.body, { status: result.status });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { eventId: string } }
) {
  const authenticatedUser = await requireAuthenticatedApiUser(request);
  if (!authenticatedUser.ok) {
    return authenticatedUser.response;
  }
  const actorUserId = authenticatedUser.userId;
  const eventId = params.eventId;
  if (!eventId) {
    return NextResponse.json({ error: "missing-event-id" }, { status: 400 });
  }

  const result = await deleteCalendarEvent(eventId, actorUserId);
  return NextResponse.json(result.body, { status: result.status });
}
