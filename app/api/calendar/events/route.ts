import { NextRequest, NextResponse } from "next/server";

import { getSessionUserIdFromRequest } from "@/lib/auth/session-user";
import {
  createCalendarEvent,
  listCalendarEvents,
} from "@/lib/services/calendar-service";

export async function GET(request: NextRequest) {
  const actorUserId = (await getSessionUserIdFromRequest(request)) ?? "";
  const result = await listCalendarEvents({
    actorUserId,
    rangeRaw: request.nextUrl.searchParams.get("range"),
    daysRaw: request.nextUrl.searchParams.get("days"),
  });

  return NextResponse.json(result.body, { status: result.status });
}

export async function POST(request: NextRequest) {
  const actorUserId = (await getSessionUserIdFromRequest(request)) ?? "";
  const rawBody = (await request.json().catch(() => null)) as unknown;
  const result = await createCalendarEvent(rawBody, actorUserId);

  return NextResponse.json(result.body, { status: result.status });
}
