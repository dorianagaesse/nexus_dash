import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import {
  GOOGLE_CALENDAR_CONNECTION_ID,
  createExpiryDate,
  getGoogleCalendarId,
  refreshAccessToken,
} from "@/lib/google-calendar";

interface GoogleCalendarApiEvent {
  id?: string;
  status?: string;
  summary?: string;
  location?: string;
  htmlLink?: string;
  start?: {
    date?: string;
    dateTime?: string;
  };
  end?: {
    date?: string;
    dateTime?: string;
  };
}

interface CalendarEventResponseItem {
  id: string;
  summary: string;
  start: string;
  end: string | null;
  isAllDay: boolean;
  location: string | null;
  htmlLink: string | null;
  status: string;
}

interface CalendarQueryWindow {
  range: "current-week" | "rolling-days";
  days: number;
  timeMin: Date;
  timeMax: Date;
}

function readDaysParam(request: NextRequest): number {
  const rawValue = request.nextUrl.searchParams.get("days");
  const parsed = Number.parseInt(rawValue ?? "14", 10);

  if (!Number.isFinite(parsed)) {
    return 14;
  }

  return Math.min(Math.max(parsed, 1), 60);
}

function buildCurrentWeekWindow(now: Date): CalendarQueryWindow {
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  const dayOfWeek = weekStart.getDay();
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  weekStart.setDate(weekStart.getDate() - daysSinceMonday);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  return {
    range: "current-week",
    days: 7,
    timeMin: weekStart,
    timeMax: weekEnd,
  };
}

function buildQueryWindow(request: NextRequest): CalendarQueryWindow {
  const now = new Date();
  const range = request.nextUrl.searchParams.get("range");

  if (range === "current-week") {
    return buildCurrentWeekWindow(now);
  }

  const days = readDaysParam(request);
  return {
    range: "rolling-days",
    days,
    timeMin: now,
    timeMax: new Date(now.getTime() + days * 24 * 60 * 60 * 1000),
  };
}

function isAccessTokenFresh(expiresAt: Date | null, nowMs: number): boolean {
  if (!expiresAt) {
    return false;
  }

  return expiresAt.getTime() - nowMs > 30 * 1000;
}

function normalizeGoogleEvent(
  event: GoogleCalendarApiEvent
): CalendarEventResponseItem | null {
  const start = event.start?.dateTime ?? event.start?.date;
  const end = event.end?.dateTime ?? event.end?.date ?? null;

  if (!event.id || !start) {
    return null;
  }

  return {
    id: event.id,
    summary: event.summary?.trim() || "(No title)",
    start,
    end,
    isAllDay: Boolean(event.start?.date && !event.start?.dateTime),
    location: event.location ?? null,
    htmlLink: event.htmlLink ?? null,
    status: event.status ?? "confirmed",
  };
}

async function fetchGoogleCalendarEvents(input: {
  accessToken: string;
  calendarId: string;
  timeMin: Date;
  timeMax: Date;
}) {
  const requestUrl = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      input.calendarId
    )}/events`
  );
  requestUrl.searchParams.set("singleEvents", "true");
  requestUrl.searchParams.set("orderBy", "startTime");
  requestUrl.searchParams.set("maxResults", "250");
  requestUrl.searchParams.set("showDeleted", "false");
  requestUrl.searchParams.set("timeMin", input.timeMin.toISOString());
  requestUrl.searchParams.set("timeMax", input.timeMax.toISOString());

  const response = await fetch(requestUrl, {
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
    },
    cache: "no-store",
  });

  return response;
}

export async function GET(request: NextRequest) {
  const queryWindow = buildQueryWindow(request);
  const calendarId = getGoogleCalendarId();
  const nowMs = Date.now();

  try {
    const credential = await prisma.googleCalendarCredential.findUnique({
      where: { id: GOOGLE_CALENDAR_CONNECTION_ID },
    });

    if (!credential) {
      return NextResponse.json(
        { connected: false, error: "not-connected" },
        { status: 401 }
      );
    }

    let accessToken = credential.accessToken ?? null;
    let expiresAt = credential.expiresAt ?? null;

    if (!accessToken || !isAccessTokenFresh(expiresAt, nowMs)) {
      try {
        const refreshed = await refreshAccessToken(credential.refreshToken);
        accessToken = refreshed.accessToken;
        expiresAt = createExpiryDate(refreshed.expiresIn);

        await prisma.googleCalendarCredential.update({
          where: { id: GOOGLE_CALENDAR_CONNECTION_ID },
          data: {
            accessToken,
            expiresAt,
            tokenType: refreshed.tokenType ?? credential.tokenType,
            scope: refreshed.scope ?? credential.scope,
            refreshToken: refreshed.refreshToken ?? credential.refreshToken,
          },
        });
      } catch (error) {
        console.error("[GET /api/calendar/events] refresh failed", error);
        return NextResponse.json(
          { connected: false, error: "reauthorization-required" },
          { status: 401 }
        );
      }
    }

    if (!accessToken) {
      return NextResponse.json(
        { connected: false, error: "reauthorization-required" },
        { status: 401 }
      );
    }

    let eventsResponse = await fetchGoogleCalendarEvents({
      accessToken,
      calendarId,
      timeMin: queryWindow.timeMin,
      timeMax: queryWindow.timeMax,
    });

    if (eventsResponse.status === 401) {
      try {
        const refreshed = await refreshAccessToken(credential.refreshToken);
        accessToken = refreshed.accessToken;
        expiresAt = createExpiryDate(refreshed.expiresIn);

        await prisma.googleCalendarCredential.update({
          where: { id: GOOGLE_CALENDAR_CONNECTION_ID },
          data: {
            accessToken,
            expiresAt,
            tokenType: refreshed.tokenType ?? credential.tokenType,
            scope: refreshed.scope ?? credential.scope,
            refreshToken: refreshed.refreshToken ?? credential.refreshToken,
          },
        });
      } catch (error) {
        console.error(
          "[GET /api/calendar/events] refresh-after-unauthorized failed",
          error
        );
        return NextResponse.json(
          { connected: false, error: "reauthorization-required" },
          { status: 401 }
        );
      }

      eventsResponse = await fetchGoogleCalendarEvents({
        accessToken,
        calendarId,
        timeMin: queryWindow.timeMin,
        timeMax: queryWindow.timeMax,
      });
    }

    if (!eventsResponse.ok) {
      const payload = (await eventsResponse.json().catch(() => null)) as
        | Record<string, unknown>
        | null;
      const apiError =
        payload && typeof payload.error === "object" && payload.error
          ? payload.error
          : null;
      console.error("[GET /api/calendar/events] google api error", apiError);

      return NextResponse.json(
        { connected: true, error: "calendar-fetch-failed" },
        { status: 502 }
      );
    }

    const payload = (await eventsResponse.json()) as {
      items?: GoogleCalendarApiEvent[];
    };

    const events = (payload.items ?? [])
      .map((item) => normalizeGoogleEvent(item))
      .filter((item): item is CalendarEventResponseItem => item !== null);

    return NextResponse.json({
      connected: true,
      calendarId,
      range: queryWindow.range,
      days: queryWindow.days,
      timeMin: queryWindow.timeMin.toISOString(),
      timeMax: queryWindow.timeMax.toISOString(),
      syncedAt: new Date().toISOString(),
      events,
    });
  } catch (error) {
    console.error("[GET /api/calendar/events]", error);
    return NextResponse.json(
      { connected: false, error: "calendar-internal-error" },
      { status: 500 }
    );
  }
}
