import {
  GOOGLE_CALENDAR_SCOPE_EVENTS,
  GOOGLE_CALENDAR_SCOPE_FULL,
  createExpiryDate,
  getGoogleCalendarId,
  refreshAccessToken,
} from "@/lib/google-calendar";
import {
  findGoogleCalendarCredential,
  updateGoogleCalendarCredentialTokens,
} from "@/lib/services/google-calendar-credential-service";

interface AuthorizedCalendarContext {
  accessToken: string;
  calendarId: string;
  scope: string | null;
}

interface UnauthorizedCalendarContext {
  status: number;
  error: string;
}

export type CalendarAuthResult =
  | { ok: true; context: AuthorizedCalendarContext }
  | { ok: false; failure: UnauthorizedCalendarContext };

function isAccessTokenFresh(expiresAt: Date | null, nowMs: number): boolean {
  if (!expiresAt) {
    return false;
  }

  return expiresAt.getTime() - nowMs > 30 * 1000;
}

export function hasCalendarWriteScope(scope: string | null): boolean {
  if (!scope) {
    return false;
  }

  const scopes = scope.split(/\s+/).filter(Boolean);
  return (
    scopes.includes(GOOGLE_CALENDAR_SCOPE_EVENTS) ||
    scopes.includes(GOOGLE_CALENDAR_SCOPE_FULL)
  );
}

export async function getAuthorizedGoogleCalendarContext(): Promise<CalendarAuthResult> {
  const credential = await findGoogleCalendarCredential();

  if (!credential) {
    return {
      ok: false,
      failure: { status: 401, error: "not-connected" },
    };
  }

  const nowMs = Date.now();
  let accessToken = credential.accessToken ?? null;
  let expiresAt = credential.expiresAt ?? null;
  let scope = credential.scope ?? null;

  if (!accessToken || !isAccessTokenFresh(expiresAt, nowMs)) {
    try {
      const refreshed = await refreshAccessToken(credential.refreshToken);
      accessToken = refreshed.accessToken;
      expiresAt = createExpiryDate(refreshed.expiresIn);
      scope = refreshed.scope ?? scope;

      await updateGoogleCalendarCredentialTokens({
        accessToken,
        expiresIn: refreshed.expiresIn,
        tokenType: refreshed.tokenType ?? credential.tokenType,
        scope,
        refreshToken: refreshed.refreshToken ?? credential.refreshToken,
      });
    } catch (error) {
      console.error("[getAuthorizedGoogleCalendarContext] refresh failed", error);
      return {
        ok: false,
        failure: { status: 401, error: "reauthorization-required" },
      };
    }
  }

  if (!accessToken) {
    return {
      ok: false,
      failure: { status: 401, error: "reauthorization-required" },
    };
  }

  return {
    ok: true,
    context: {
      accessToken,
      calendarId: getGoogleCalendarId(),
      scope,
    },
  };
}
