import { NextRequest, NextResponse } from "next/server";

import {
  createCalendarEvent,
  listCalendarEvents,
} from "@/lib/services/calendar-service";

export async function GET(request: NextRequest) {
  const result = await listCalendarEvents({
    rangeRaw: request.nextUrl.searchParams.get("range"),
    daysRaw: request.nextUrl.searchParams.get("days"),
  });

  return NextResponse.json(result.body, { status: result.status });
}

export async function POST(request: NextRequest) {
  const rawBody = (await request.json().catch(() => null)) as unknown;
  const result = await createCalendarEvent(rawBody);

  return NextResponse.json(result.body, { status: result.status });
}
