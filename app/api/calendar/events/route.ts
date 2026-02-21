import { NextRequest, NextResponse } from "next/server";

import {
  createCalendarEvent,
  listCalendarEvents,
} from "@/lib/services/calendar-service";
import { getActorHeaderUserId } from "@/lib/request-actor";

export async function GET(request: NextRequest) {
  const actorUserId = getActorHeaderUserId(request.headers);
  const projectId = request.nextUrl.searchParams.get("projectId");
  const result = await listCalendarEvents({
    rangeRaw: request.nextUrl.searchParams.get("range"),
    daysRaw: request.nextUrl.searchParams.get("days"),
    projectId,
    actorUserId,
  });

  return NextResponse.json(result.body, { status: result.status });
}

export async function POST(request: NextRequest) {
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
  const result = await createCalendarEvent(serviceBody);

  return NextResponse.json(result.body, { status: result.status });
}
