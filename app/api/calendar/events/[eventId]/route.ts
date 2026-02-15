import { NextRequest, NextResponse } from "next/server";

import {
  getAuthorizedGoogleCalendarContext,
  hasCalendarWriteScope,
} from "@/lib/google-calendar-access";

interface GoogleCalendarApiEvent {
  id?: string;
  status?: string;
  summary?: string;
  location?: string;
  description?: string;
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
  description: string | null;
  htmlLink: string | null;
  status: string;
}

interface UpsertEventRequestPayload {
  summary: string;
  start: string;
  end: string;
  isAllDay: boolean;
  location?: string;
  description?: string;
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
    description: event.description ?? null,
    htmlLink: event.htmlLink ?? null,
    status: event.status ?? "confirmed",
  };
}

function parseGoogleErrorReason(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const errorObject = (payload as { error?: unknown }).error;
  if (!errorObject || typeof errorObject !== "object") {
    return null;
  }

  const errors = (errorObject as { errors?: unknown }).errors;
  if (!Array.isArray(errors) || errors.length === 0) {
    return null;
  }

  const firstError = errors[0] as { reason?: unknown };
  return typeof firstError.reason === "string" ? firstError.reason : null;
}

function isDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseUpsertEventPayload(raw: unknown):
  | { ok: true; payload: UpsertEventRequestPayload }
  | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "invalid-payload" };
  }

  const payload = raw as {
    summary?: unknown;
    start?: unknown;
    end?: unknown;
    isAllDay?: unknown;
    location?: unknown;
    description?: unknown;
  };

  const summary =
    typeof payload.summary === "string" ? payload.summary.trim() : "";
  if (summary.length < 1 || summary.length > 200) {
    return { ok: false, error: "invalid-summary" };
  }

  const start = typeof payload.start === "string" ? payload.start.trim() : "";
  const end = typeof payload.end === "string" ? payload.end.trim() : "";
  if (!start || !end) {
    return { ok: false, error: "invalid-dates" };
  }

  const isAllDay = Boolean(payload.isAllDay);
  const location =
    typeof payload.location === "string" ? payload.location.trim() : "";
  const description =
    typeof payload.description === "string" ? payload.description.trim() : "";

  if (isAllDay) {
    if (!isDateOnly(start) || !isDateOnly(end)) {
      return { ok: false, error: "invalid-dates" };
    }

    if (start > end) {
      return { ok: false, error: "invalid-date-order" };
    }
  } else {
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime()) ||
      endDate.getTime() <= startDate.getTime()
    ) {
      return { ok: false, error: "invalid-date-order" };
    }
  }

  return {
    ok: true,
    payload: {
      summary,
      start,
      end,
      isAllDay,
      location: location || undefined,
      description: description || undefined,
    },
  };
}

function toGoogleEventRequest(payload: UpsertEventRequestPayload) {
  if (payload.isAllDay) {
    const endDate = new Date(`${payload.end}T00:00:00`);
    endDate.setDate(endDate.getDate() + 1);
    const endExclusive = endDate.toISOString().slice(0, 10);

    return {
      summary: payload.summary,
      location: payload.location,
      description: payload.description,
      start: { date: payload.start },
      end: { date: endExclusive },
    };
  }

  return {
    summary: payload.summary,
    location: payload.location,
    description: payload.description,
    start: { dateTime: new Date(payload.start).toISOString() },
    end: { dateTime: new Date(payload.end).toISOString() },
  };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { eventId: string } }
) {
  const eventId = params.eventId;
  if (!eventId) {
    return NextResponse.json({ error: "missing-event-id" }, { status: 400 });
  }

  try {
    const auth = await getAuthorizedGoogleCalendarContext();
    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.failure.error },
        { status: auth.failure.status }
      );
    }

    if (!hasCalendarWriteScope(auth.context.scope)) {
      return NextResponse.json({ error: "insufficient-scope" }, { status: 403 });
    }

    const rawBody = (await request.json().catch(() => null)) as unknown;
    const parsedPayload = parseUpsertEventPayload(rawBody);
    if (!parsedPayload.ok) {
      return NextResponse.json({ error: parsedPayload.error }, { status: 400 });
    }

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
        auth.context.calendarId
      )}/events/${encodeURIComponent(eventId)}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${auth.context.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(toGoogleEventRequest(parsedPayload.payload)),
      }
    );

    const responsePayload = (await response.json().catch(() => null)) as unknown;

    if (!response.ok) {
      const reason = parseGoogleErrorReason(responsePayload);
      if (response.status === 403 && reason === "insufficientPermissions") {
        return NextResponse.json({ error: "insufficient-scope" }, { status: 403 });
      }

      if (response.status === 401) {
        return NextResponse.json(
          { error: "reauthorization-required" },
          { status: 401 }
        );
      }

      if (response.status === 404) {
        return NextResponse.json({ error: "event-not-found" }, { status: 404 });
      }

      console.error(
        "[PATCH /api/calendar/events/:eventId] google api error",
        responsePayload
      );
      return NextResponse.json({ error: "calendar-update-failed" }, { status: 502 });
    }

    const normalized = normalizeGoogleEvent(responsePayload as GoogleCalendarApiEvent);
    if (!normalized) {
      return NextResponse.json({ error: "calendar-update-failed" }, { status: 502 });
    }

    return NextResponse.json({ event: normalized });
  } catch (error) {
    console.error("[PATCH /api/calendar/events/:eventId]", error);
    return NextResponse.json({ error: "calendar-internal-error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { eventId: string } }
) {
  const eventId = params.eventId;
  if (!eventId) {
    return NextResponse.json({ error: "missing-event-id" }, { status: 400 });
  }

  try {
    const auth = await getAuthorizedGoogleCalendarContext();
    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.failure.error },
        { status: auth.failure.status }
      );
    }

    if (!hasCalendarWriteScope(auth.context.scope)) {
      return NextResponse.json({ error: "insufficient-scope" }, { status: 403 });
    }

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
        auth.context.calendarId
      )}/events/${encodeURIComponent(eventId)}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${auth.context.accessToken}`,
        },
      }
    );

    if (!response.ok) {
      const responsePayload = (await response.json().catch(() => null)) as unknown;
      const reason = parseGoogleErrorReason(responsePayload);
      if (response.status === 403 && reason === "insufficientPermissions") {
        return NextResponse.json({ error: "insufficient-scope" }, { status: 403 });
      }

      if (response.status === 401) {
        return NextResponse.json(
          { error: "reauthorization-required" },
          { status: 401 }
        );
      }

      if (response.status === 404) {
        return NextResponse.json({ error: "event-not-found" }, { status: 404 });
      }

      console.error(
        "[DELETE /api/calendar/events/:eventId] google api error",
        responsePayload
      );
      return NextResponse.json({ error: "calendar-delete-failed" }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[DELETE /api/calendar/events/:eventId]", error);
    return NextResponse.json({ error: "calendar-internal-error" }, { status: 500 });
  }
}
