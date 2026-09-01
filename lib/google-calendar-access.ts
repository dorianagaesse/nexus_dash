import {
  GOOGLE_CALENDAR_SCOPE_EVENTS,
  GOOGLE_CALENDAR_SCOPE_FULL,
} from "@/lib/google-calendar";
import {
  ensureFreshAccessToken,
  getWritableCalendarSourceContext,
  type CalendarSourceContext,
} from "@/lib/services/calendar-connection-service";
import { logServerError } from "@/lib/observability/logger";

interface AuthorizedCalendarContext {
  accessToken: string;
  calendarId: string;
  calendarSourceId: string;
  connectionId: string;
  calendarName: string;
  calendarColor: string | null;
  accountLabel: string;
  accountEmail: string | null;
  scope: string | null;
  writable: boolean;
}

interface UnauthorizedCalendarContext {
  status: number;
  error: string;
}

export type CalendarAuthResult =
  | { ok: true; context: AuthorizedCalendarContext }
  | { ok: false; failure: UnauthorizedCalendarContext };

export function hasCalendarWriteScope(scope: string | null): boolean {
  if (!scope) return false;
  const scopes = scope.split(/\s+/).filter(Boolean);
  return (
    scopes.includes(GOOGLE_CALENDAR_SCOPE_EVENTS) ||
    scopes.includes(GOOGLE_CALENDAR_SCOPE_FULL)
  );
}

export async function authorizeCalendarSourceContext(
  actorUserId: string,
  sourceContext: CalendarSourceContext
): Promise<CalendarAuthResult> {
  try {
    const accessToken = await ensureFreshAccessToken(
      actorUserId,
      sourceContext.connection
    );
    return {
      ok: true,
      context: {
        accessToken,
        calendarId: sourceContext.source.providerCalendarId,
        calendarSourceId: sourceContext.source.id,
        connectionId: sourceContext.connection.id,
        calendarName: sourceContext.source.name,
        calendarColor: sourceContext.source.color,
        accountLabel: sourceContext.connection.accountLabel,
        accountEmail: sourceContext.connection.accountEmail,
        scope: sourceContext.connection.scopes,
        writable:
          sourceContext.writable &&
          hasCalendarWriteScope(sourceContext.connection.scopes),
      },
    };
  } catch (error) {
    logServerError("authorizeCalendarSourceContext.refresh", error);
    return {
      ok: false,
      failure: { status: 401, error: "reauthorization-required" },
    };
  }
}

export async function getAuthorizedGoogleCalendarContext(
  actorUserId: string,
  sourceId?: string | null
): Promise<CalendarAuthResult> {
  const normalizedActorUserId = actorUserId.trim();
  if (!normalizedActorUserId) {
    return { ok: false, failure: { status: 401, error: "unauthorized" } };
  }

  try {
    const sourceContext = await getWritableCalendarSourceContext(
      normalizedActorUserId,
      sourceId
    );
    if (!sourceContext) {
      return { ok: false, failure: { status: 401, error: "not-connected" } };
    }
    return authorizeCalendarSourceContext(normalizedActorUserId, sourceContext);
  } catch (error) {
    logServerError("getAuthorizedGoogleCalendarContext.lookup", error);
    return {
      ok: false,
      failure: { status: 503, error: "calendar-unavailable" },
    };
  }
}
