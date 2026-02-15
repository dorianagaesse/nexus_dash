import { NextRequest, NextResponse } from "next/server";

import {
  deleteCalendarEvent,
  updateCalendarEvent,
} from "@/lib/services/calendar-service";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { eventId: string } }
) {
  const eventId = params.eventId;
  if (!eventId) {
    return NextResponse.json({ error: "missing-event-id" }, { status: 400 });
  }

  const rawBody = (await request.json().catch(() => null)) as unknown;
  const result = await updateCalendarEvent(eventId, rawBody);

  return NextResponse.json(result.body, { status: result.status });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { eventId: string } }
) {
  const eventId = params.eventId;
  if (!eventId) {
    return NextResponse.json({ error: "missing-event-id" }, { status: 400 });
  }

  const result = await deleteCalendarEvent(eventId);
  return NextResponse.json(result.body, { status: result.status });
}
