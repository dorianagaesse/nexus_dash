import {
  getAuthorizedGoogleCalendarContext,
  hasCalendarWriteScope,
} from "@/lib/google-calendar-access";
import { logServerError } from "@/lib/observability/logger";

interface ServiceErrorResult {
  ok: false;
  status: number;
  body: Record<string, unknown>;
}

interface ServiceSuccessResult<T extends Record<string, unknown>> {
  ok: true;
  status: number;
  body: T;
}

type ServiceResult<T extends Record<string, unknown>> =
  | ServiceSuccessResult<T>
  | ServiceErrorResult;

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

export interface CalendarEventResponseItem {
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

interface CalendarQueryWindow {
  range: "current-week" | "rolling-days";
  days: number;
  timeMin: Date;
  timeMax: Date;
}

interface UpsertEventRequestPayload {
  summary: string;
  start: string;
  end: string;
  isAllDay: boolean;
  location?: string;
  description?: string;
}

function createError(status: number, body: Record<string, unknown>): ServiceErrorResult {
  return { ok: false, status, body };
}

function createSuccess<T extends Record<string, unknown>>(
  status: number,
  body: T
): ServiceSuccessResult<T> {
  return { ok: true, status, body };
}

function readDaysParam(daysRaw: string | null): number {
  const parsed = Number.parseInt(daysRaw ?? "14", 10);

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

function buildQueryWindow(input: {
  rangeRaw: string | null;
  daysRaw: string | null;
  now?: Date;
}): CalendarQueryWindow {
  const now = input.now ?? new Date();

  if (input.rangeRaw === "current-week") {
    return buildCurrentWeekWindow(now);
  }

  const days = readDaysParam(input.daysRaw);
  return {
    range: "rolling-days",
    days,
    timeMin: now,
    timeMax: new Date(now.getTime() + days * 24 * 60 * 60 * 1000),
  };
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

  return fetch(requestUrl, {
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
    },
    cache: "no-store",
  });
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

function summarizeGoogleApiError(input: {
  status: number;
  statusText: string;
  reason: string | null;
  payload: unknown;
}): Record<string, unknown> {
  const errorObject =
    input.payload &&
    typeof input.payload === "object" &&
    "error" in (input.payload as Record<string, unknown>) &&
    (input.payload as { error?: unknown }).error &&
    typeof (input.payload as { error?: unknown }).error === "object"
      ? ((input.payload as { error: Record<string, unknown> }).error ?? null)
      : null;

  const code = errorObject?.code;
  const status = errorObject?.status;
  const message = errorObject?.message;

  return {
    status: input.status,
    statusText: input.statusText,
    reason: input.reason ?? undefined,
    errorCode:
      typeof code === "string" || typeof code === "number" ? code : undefined,
    errorStatus: typeof status === "string" ? status : undefined,
    errorMessage:
      typeof message === "string" ? message.slice(0, 500) : undefined,
  };
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

async function resolveWritableCalendarContext() {
  const auth = await getAuthorizedGoogleCalendarContext();
  if (!auth.ok) {
    return createError(auth.failure.status, { error: auth.failure.error });
  }

  if (!hasCalendarWriteScope(auth.context.scope)) {
    return createError(403, { error: "insufficient-scope" });
  }

  return createSuccess(200, { context: auth.context });
}

export async function listCalendarEvents(input: {
  rangeRaw: string | null;
  daysRaw: string | null;
  now?: Date;
}): Promise<
  ServiceResult<{
    connected: true;
    calendarId: string;
    range: "current-week" | "rolling-days";
    days: number;
    timeMin: string;
    timeMax: string;
    syncedAt: string;
    events: CalendarEventResponseItem[];
  }>
> {
  const queryWindow = buildQueryWindow(input);

  try {
    const auth = await getAuthorizedGoogleCalendarContext();
    if (!auth.ok) {
      return createError(auth.failure.status, {
        connected: false,
        error: auth.failure.error,
      });
    }

    const eventsResponse = await fetchGoogleCalendarEvents({
      accessToken: auth.context.accessToken,
      calendarId: auth.context.calendarId,
      timeMin: queryWindow.timeMin,
      timeMax: queryWindow.timeMax,
    });

    if (!eventsResponse.ok) {
      const payload = (await eventsResponse.json().catch(() => null)) as unknown;
      const reason = parseGoogleErrorReason(payload);

      if (eventsResponse.status === 401) {
        return createError(401, {
          connected: false,
          error: "reauthorization-required",
        });
      }

      if (eventsResponse.status === 403 && reason === "insufficientPermissions") {
        return createError(403, {
          connected: true,
          error: "insufficient-scope",
        });
      }

      logServerError("listCalendarEvents.googleApiError", "google-api-error", {
        googleApi: summarizeGoogleApiError({
          status: eventsResponse.status,
          statusText: eventsResponse.statusText,
          reason,
          payload,
        }),
      });
      return createError(502, {
        connected: true,
        error: "calendar-fetch-failed",
      });
    }

    const payload = (await eventsResponse.json()) as {
      items?: GoogleCalendarApiEvent[];
    };

    const events = (payload.items ?? [])
      .map((item) => normalizeGoogleEvent(item))
      .filter((item): item is CalendarEventResponseItem => item !== null);

    return createSuccess(200, {
      connected: true as const,
      calendarId: auth.context.calendarId,
      range: queryWindow.range,
      days: queryWindow.days,
      timeMin: queryWindow.timeMin.toISOString(),
      timeMax: queryWindow.timeMax.toISOString(),
      syncedAt: new Date().toISOString(),
      events,
    });
  } catch (error) {
    logServerError("listCalendarEvents", error);
    return createError(500, {
      connected: false,
      error: "calendar-internal-error",
    });
  }
}

export async function createCalendarEvent(rawBody: unknown): Promise<
  ServiceResult<{
    event: CalendarEventResponseItem;
  }>
> {
  try {
    const auth = await resolveWritableCalendarContext();
    if (!auth.ok) {
      return auth;
    }

    const parsedPayload = parseUpsertEventPayload(rawBody);
    if (!parsedPayload.ok) {
      return createError(400, { error: parsedPayload.error });
    }

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
        auth.body.context.calendarId
      )}/events`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${auth.body.context.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(toGoogleEventRequest(parsedPayload.payload)),
      }
    );

    const responsePayload = (await response.json().catch(() => null)) as unknown;

    if (!response.ok) {
      const reason = parseGoogleErrorReason(responsePayload);
      if (response.status === 403 && reason === "insufficientPermissions") {
        return createError(403, { error: "insufficient-scope" });
      }

      if (response.status === 401) {
        return createError(401, { error: "reauthorization-required" });
      }

      logServerError("createCalendarEvent.googleApiError", "google-api-error", {
        googleApi: summarizeGoogleApiError({
          status: response.status,
          statusText: response.statusText,
          reason,
          payload: responsePayload,
        }),
      });
      return createError(502, { error: "calendar-create-failed" });
    }

    const normalized = normalizeGoogleEvent(responsePayload as GoogleCalendarApiEvent);
    if (!normalized) {
      return createError(502, { error: "calendar-create-failed" });
    }

    return createSuccess(201, { event: normalized });
  } catch (error) {
    logServerError("createCalendarEvent", error);
    return createError(500, { error: "calendar-internal-error" });
  }
}

export async function updateCalendarEvent(
  eventId: string,
  rawBody: unknown
): Promise<
  ServiceResult<{
    event: CalendarEventResponseItem;
  }>
> {
  try {
    const auth = await resolveWritableCalendarContext();
    if (!auth.ok) {
      return auth;
    }

    const parsedPayload = parseUpsertEventPayload(rawBody);
    if (!parsedPayload.ok) {
      return createError(400, { error: parsedPayload.error });
    }

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
        auth.body.context.calendarId
      )}/events/${encodeURIComponent(eventId)}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${auth.body.context.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(toGoogleEventRequest(parsedPayload.payload)),
      }
    );

    const responsePayload = (await response.json().catch(() => null)) as unknown;

    if (!response.ok) {
      const reason = parseGoogleErrorReason(responsePayload);
      if (response.status === 403 && reason === "insufficientPermissions") {
        return createError(403, { error: "insufficient-scope" });
      }

      if (response.status === 401) {
        return createError(401, { error: "reauthorization-required" });
      }

      if (response.status === 404) {
        return createError(404, { error: "event-not-found" });
      }

      logServerError("updateCalendarEvent.googleApiError", "google-api-error", {
        googleApi: summarizeGoogleApiError({
          status: response.status,
          statusText: response.statusText,
          reason,
          payload: responsePayload,
        }),
      });
      return createError(502, { error: "calendar-update-failed" });
    }

    const normalized = normalizeGoogleEvent(responsePayload as GoogleCalendarApiEvent);
    if (!normalized) {
      return createError(502, { error: "calendar-update-failed" });
    }

    return createSuccess(200, { event: normalized });
  } catch (error) {
    logServerError("updateCalendarEvent", error);
    return createError(500, { error: "calendar-internal-error" });
  }
}

export async function deleteCalendarEvent(
  eventId: string
): Promise<ServiceResult<{ ok: true }>> {
  try {
    const auth = await resolveWritableCalendarContext();
    if (!auth.ok) {
      return auth;
    }

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
        auth.body.context.calendarId
      )}/events/${encodeURIComponent(eventId)}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${auth.body.context.accessToken}`,
        },
      }
    );

    if (!response.ok) {
      const responsePayload = (await response.json().catch(() => null)) as unknown;
      const reason = parseGoogleErrorReason(responsePayload);
      if (response.status === 403 && reason === "insufficientPermissions") {
        return createError(403, { error: "insufficient-scope" });
      }

      if (response.status === 401) {
        return createError(401, { error: "reauthorization-required" });
      }

      if (response.status === 404) {
        return createError(404, { error: "event-not-found" });
      }

      logServerError("deleteCalendarEvent.googleApiError", "google-api-error", {
        googleApi: summarizeGoogleApiError({
          status: response.status,
          statusText: response.statusText,
          reason,
          payload: responsePayload,
        }),
      });
      return createError(502, { error: "calendar-delete-failed" });
    }

    return createSuccess(200, { ok: true as const });
  } catch (error) {
    logServerError("deleteCalendarEvent", error);
    return createError(500, { error: "calendar-internal-error" });
  }
}
