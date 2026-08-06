import {
  authorizeCalendarSourceContext,
  getAuthorizedGoogleCalendarContext,
  hasCalendarWriteScope,
} from "@/lib/google-calendar-access";
import { getCalendarProvider } from "@/lib/calendar-providers/google";
import { logServerError } from "@/lib/observability/logger";
import { requireProjectRole } from "@/lib/services/project-access-service";
import { withActorRlsContext } from "@/lib/services/rls-context";
import { getSelectedCalendarSourceContexts } from "@/lib/services/calendar-connection-service";

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
  calendarSourceId?: string;
  connectionId?: string;
  calendarName?: string;
  calendarColor?: string | null;
  writable?: boolean;
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
  calendarSourceId?: string;
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
  event: GoogleCalendarApiEvent,
  source?: {
    calendarSourceId?: string;
    connectionId?: string;
    calendarName?: string;
    calendarColor?: string | null;
    writable?: boolean;
  }
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
    ...(source?.calendarSourceId ? source : {}),
  };
}

async function fetchGoogleCalendarEvents(input: {
  accessToken: string;
  calendarId: string;
  timeMin: Date;
  timeMax: Date;
  pageToken?: string | null;
}) {
  const query = new URLSearchParams({
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
    showDeleted: "false",
    timeMin: input.timeMin.toISOString(),
    timeMax: input.timeMax.toISOString(),
  });
  if (input.pageToken) query.set("pageToken", input.pageToken);
  return getCalendarProvider("google").requestEvents({
    accessToken: input.accessToken,
    calendarId: input.calendarId,
    query,
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
    calendarSourceId?: unknown;
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
  const calendarSourceId =
    typeof payload.calendarSourceId === "string"
      ? payload.calendarSourceId.trim()
      : "";

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
      calendarSourceId: calendarSourceId || undefined,
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

async function resolveWritableCalendarContext(
  actorUserId: string,
  sourceId?: string | null
) {
  const auth = await getAuthorizedGoogleCalendarContext(actorUserId, sourceId);
  if (!auth.ok) {
    return createError(auth.failure.status, { error: auth.failure.error });
  }

  if (
    auth.context.writable === false ||
    !hasCalendarWriteScope(auth.context.scope)
  ) {
    return createError(403, { error: "insufficient-scope" });
  }

  return createSuccess(200, { context: auth.context });
}

async function ensureCalendarProjectAccess(input: {
  actorUserId: string;
  projectId: string;
  minimumRole: "viewer" | "editor";
}) {
  const projectId = input.projectId.trim();
  if (!projectId) {
    return createError(400, { error: "project-id-required" });
  }

  return withActorRlsContext(input.actorUserId, async (db) => {
    const access = await requireProjectRole({
      actorUserId: input.actorUserId,
      projectId,
      minimumRole: input.minimumRole,
      db,
    });

    if (!access.ok) {
      return createError(access.status, { error: access.error });
    }

    return createSuccess(200, { role: access.role, projectId });
  });
}

export async function listCalendarEvents(input: {
  actorUserId: string;
  projectId: string;
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
    warnings: Array<{
      calendarSourceId: string;
      connectionId: string;
      error: string;
    }>;
    truncated: boolean;
    sources: Array<{
      id: string;
      connectionId: string;
      name: string;
      color: string | null;
      writable: boolean;
    }>;
  }>
> {
  const queryWindow = buildQueryWindow(input);

  try {
    const projectAccess = await ensureCalendarProjectAccess({
      actorUserId: input.actorUserId,
      projectId: input.projectId,
      minimumRole: "viewer",
    });
    if (!projectAccess.ok) {
      return projectAccess;
    }

    const sourceContexts = await getSelectedCalendarSourceContexts(input.actorUserId);
    if (sourceContexts.length === 0) {
      return createError(401, { connected: false, error: "not-connected" });
    }

    const results: Array<{
      events: CalendarEventResponseItem[];
      warning: {
        calendarSourceId: string;
        connectionId: string;
        error: string;
      } | null;
      truncated: boolean;
    }> = new Array(sourceContexts.length);
    let cursor = 0;
    const worker = async () => {
      while (cursor < sourceContexts.length) {
        const index = cursor++;
        const sourceContext = sourceContexts[index];
        const auth = await authorizeCalendarSourceContext(
          input.actorUserId,
          sourceContext
        );
        if (!auth.ok) {
          results[index] = {
            events: [],
            warning: {
              calendarSourceId: sourceContext.source.id,
              connectionId: sourceContext.connection.id,
              error: auth.failure.error,
            },
            truncated: false,
          };
          continue;
        }

        const events: CalendarEventResponseItem[] = [];
        let pageToken: string | null = null;
        let warning: (typeof results)[number]["warning"] = null;
        let truncated = false;
        do {
          let response = await fetchGoogleCalendarEvents({
            accessToken: auth.context.accessToken,
            calendarId: auth.context.calendarId,
            timeMin: queryWindow.timeMin,
            timeMax: queryWindow.timeMax,
            pageToken,
          });
          if (response.status === 429 || response.status >= 500) {
            response = await fetchGoogleCalendarEvents({
              accessToken: auth.context.accessToken,
              calendarId: auth.context.calendarId,
              timeMin: queryWindow.timeMin,
              timeMax: queryWindow.timeMax,
              pageToken,
            });
          }
          const payload = (await response.json().catch(() => null)) as {
            items?: GoogleCalendarApiEvent[];
            nextPageToken?: unknown;
          } | null;
          if (!response.ok) {
            warning = {
              calendarSourceId: auth.context.calendarSourceId,
              connectionId: auth.context.connectionId,
              error:
                response.status === 401
                  ? "reauthorization-required"
                  : response.status === 403 &&
                      parseGoogleErrorReason(payload) === "insufficientPermissions"
                    ? "insufficient-scope"
                    : response.status === 403
                      ? "calendar-read-forbidden"
                    : "calendar-fetch-failed",
            };
            break;
          }
          events.push(
            ...(payload?.items ?? [])
              .map((event) =>
                normalizeGoogleEvent(event, {
                  calendarSourceId: auth.context.calendarSourceId,
                  connectionId: auth.context.connectionId,
                  calendarName: auth.context.calendarName,
                  calendarColor: auth.context.calendarColor,
                  writable: auth.context.writable,
                })
              )
              .filter((event): event is CalendarEventResponseItem => event !== null)
          );
          pageToken =
            typeof payload?.nextPageToken === "string"
              ? payload.nextPageToken
              : null;
          if (events.length >= 1_000 && pageToken) {
            events.splice(1_000);
            truncated = true;
            pageToken = null;
          }
        } while (pageToken);
        results[index] = { events, warning, truncated };
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(4, sourceContexts.length) }, () => worker())
    );

    const events = results
      .flatMap((result) => result.events)
      .sort(
        (left, right) =>
          left.start.localeCompare(right.start) ||
          (left.calendarSourceId ?? "").localeCompare(right.calendarSourceId ?? "") ||
          left.id.localeCompare(right.id)
      );
    const warnings = results
      .map((result) => result.warning)
      .filter((warning): warning is NonNullable<typeof warning> => warning !== null);

    if (events.length === 0 && warnings.length === sourceContexts.length) {
      const error = warnings[0]?.error ?? "calendar-fetch-failed";
      const status =
        error === "reauthorization-required" || error === "not-connected"
          ? 401
          : error === "insufficient-scope" || error === "calendar-read-forbidden"
            ? 403
            : 502;
      return createError(status, {
        connected: error !== "not-connected" && error !== "reauthorization-required",
        error,
      });
    }

    return createSuccess(200, {
      connected: true as const,
      calendarId: sourceContexts[0].source.providerCalendarId,
      range: queryWindow.range,
      days: queryWindow.days,
      timeMin: queryWindow.timeMin.toISOString(),
      timeMax: queryWindow.timeMax.toISOString(),
      syncedAt: new Date().toISOString(),
      events,
      warnings,
      truncated: results.some((result) => result.truncated),
      sources: sourceContexts.map((context) => ({
        id: context.source.id,
        connectionId: context.connection.id,
        name: context.source.name,
        color: context.source.color,
        writable:
          context.writable && hasCalendarWriteScope(context.connection.scopes),
      })),
    });
  } catch (error) {
    logServerError("listCalendarEvents", error);
    return createError(500, {
      connected: false,
      error: "calendar-internal-error",
    });
  }
}

export async function createCalendarEvent(
  rawBody: unknown,
  actorUserId: string,
  projectId: string
): Promise<
  ServiceResult<{
    event: CalendarEventResponseItem;
  }>
> {
  try {
    const projectAccess = await ensureCalendarProjectAccess({
      actorUserId,
      projectId,
      minimumRole: "editor",
    });
    if (!projectAccess.ok) {
      return projectAccess;
    }

    const requestedSourceId =
      rawBody && typeof rawBody === "object" &&
      typeof (rawBody as { calendarSourceId?: unknown }).calendarSourceId === "string"
        ? (rawBody as { calendarSourceId: string }).calendarSourceId
        : null;
    const auth = await resolveWritableCalendarContext(
      actorUserId,
      requestedSourceId
    );
    if (!auth.ok) return auth;
    const parsedPayload = parseUpsertEventPayload(rawBody);
    if (!parsedPayload.ok) {
      return createError(400, { error: parsedPayload.error });
    }

    const response = await getCalendarProvider("google").requestEvents({
      accessToken: auth.body.context.accessToken,
      calendarId: auth.body.context.calendarId,
      method: "POST",
      body: toGoogleEventRequest(parsedPayload.payload),
    });

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

    const normalized = normalizeGoogleEvent(
      responsePayload as GoogleCalendarApiEvent,
      {
        calendarSourceId: auth.body.context.calendarSourceId,
        connectionId: auth.body.context.connectionId,
        calendarName: auth.body.context.calendarName,
        calendarColor: auth.body.context.calendarColor,
        writable: auth.body.context.writable,
      }
    );
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
  rawBody: unknown,
  actorUserId: string,
  projectId: string
): Promise<
  ServiceResult<{
    event: CalendarEventResponseItem;
  }>
> {
  try {
    const projectAccess = await ensureCalendarProjectAccess({
      actorUserId,
      projectId,
      minimumRole: "editor",
    });
    if (!projectAccess.ok) {
      return projectAccess;
    }

    const requestedSourceId =
      rawBody && typeof rawBody === "object" &&
      typeof (rawBody as { calendarSourceId?: unknown }).calendarSourceId === "string"
        ? (rawBody as { calendarSourceId: string }).calendarSourceId
        : null;
    const auth = await resolveWritableCalendarContext(
      actorUserId,
      requestedSourceId
    );
    if (!auth.ok) return auth;
    const parsedPayload = parseUpsertEventPayload(rawBody);
    if (!parsedPayload.ok) {
      return createError(400, { error: parsedPayload.error });
    }

    const response = await getCalendarProvider("google").requestEvents({
      accessToken: auth.body.context.accessToken,
      calendarId: auth.body.context.calendarId,
      eventId,
      method: "PATCH",
      body: toGoogleEventRequest(parsedPayload.payload),
    });

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

    const normalized = normalizeGoogleEvent(
      responsePayload as GoogleCalendarApiEvent,
      {
        calendarSourceId: auth.body.context.calendarSourceId,
        connectionId: auth.body.context.connectionId,
        calendarName: auth.body.context.calendarName,
        calendarColor: auth.body.context.calendarColor,
        writable: auth.body.context.writable,
      }
    );
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
  eventId: string,
  actorUserId: string,
  projectId: string,
  calendarSourceId?: string | null
): Promise<ServiceResult<{ ok: true }>> {
  try {
    const projectAccess = await ensureCalendarProjectAccess({
      actorUserId,
      projectId,
      minimumRole: "editor",
    });
    if (!projectAccess.ok) {
      return projectAccess;
    }

    const auth = await resolveWritableCalendarContext(actorUserId, calendarSourceId);
    if (!auth.ok) {
      return auth;
    }

    const response = await getCalendarProvider("google").requestEvents({
      accessToken: auth.body.context.accessToken,
      calendarId: auth.body.context.calendarId,
      eventId,
      method: "DELETE",
    });

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
