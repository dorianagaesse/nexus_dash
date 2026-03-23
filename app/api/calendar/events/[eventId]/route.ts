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

  const rawBody = (await request.json().catch(() => null)) as {
    projectId?: unknown;
  } | null;
  const result = await updateCalendarEvent(
    eventId,
    rawBody,
    actorUserId,
    typeof rawBody?.projectId === "string" ? rawBody.projectId : ""
  );

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

  const result = await deleteCalendarEvent(
    eventId,
    actorUserId,
    request.nextUrl.searchParams.get("projectId") ?? ""
  );
  return NextResponse.json(result.body, { status: result.status });
}
