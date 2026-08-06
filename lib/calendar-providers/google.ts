import {
  buildGoogleOAuthUrl,
  exchangeAuthorizationCodeForTokens,
  refreshAccessToken,
  revokeGoogleToken,
} from "@/lib/google-calendar";
import type {
  CalendarProviderAdapter,
  CalendarProviderIdentity,
  CalendarProviderSource,
} from "@/lib/calendar-providers/types";

const GOOGLE_USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";
const GOOGLE_CALENDAR_LIST_ENDPOINT =
  "https://www.googleapis.com/calendar/v3/users/me/calendarList";

interface GoogleCalendarListItem {
  id?: string;
  summary?: string;
  backgroundColor?: string;
  timeZone?: string;
  accessRole?: string;
  primary?: boolean;
  deleted?: boolean;
}

function canWrite(accessRole: string | null): boolean {
  return accessRole === "owner" || accessRole === "writer";
}

async function identifyGoogleAccount(
  accessToken: string
): Promise<CalendarProviderIdentity> {
  const response = await fetch(GOOGLE_USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as {
    sub?: unknown;
    email?: unknown;
    name?: unknown;
  } | null;

  if (!response.ok || typeof payload?.sub !== "string") {
    throw new Error("google-account-identity-failed");
  }

  const email = typeof payload.email === "string" ? payload.email : null;
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  return {
    accountId: payload.sub,
    email,
    label: email ?? (name || "Google account"),
  };
}

async function discoverGoogleCalendars(
  accessToken: string
): Promise<CalendarProviderSource[]> {
  const sources: CalendarProviderSource[] = [];
  let pageToken: string | null = null;

  do {
    const url = new URL(GOOGLE_CALENDAR_LIST_ENDPOINT);
    url.searchParams.set("maxResults", "250");
    url.searchParams.set("showDeleted", "false");
    url.searchParams.set("showHidden", "true");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as {
      items?: GoogleCalendarListItem[];
      nextPageToken?: unknown;
    } | null;
    if (!response.ok) throw new Error("google-calendar-discovery-failed");

    for (const item of payload?.items ?? []) {
      if (!item.id || item.deleted) continue;
      const accessRole = item.accessRole ?? null;
      sources.push({
        providerCalendarId: item.id,
        name: item.summary?.trim() || item.id,
        color: item.backgroundColor ?? null,
        timeZone: item.timeZone ?? null,
        accessRole,
        isPrimary: Boolean(item.primary),
        writable: canWrite(accessRole),
      });
    }

    pageToken =
      typeof payload?.nextPageToken === "string" ? payload.nextPageToken : null;
  } while (pageToken);

  return sources;
}

export const googleCalendarProvider: CalendarProviderAdapter = {
  provider: "google",
  buildAuthorizationUrl(state, redirectUri) {
    return buildGoogleOAuthUrl(state, redirectUri);
  },
  exchangeAuthorizationCode(code, redirectUri) {
    return exchangeAuthorizationCodeForTokens(code, redirectUri);
  },
  identify: identifyGoogleAccount,
  refresh(refreshToken) {
    return refreshAccessToken(refreshToken);
  },
  revoke(refreshToken) {
    return revokeGoogleToken(refreshToken);
  },
  discoverCalendars: discoverGoogleCalendars,
  requestEvents(input) {
    const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      input.calendarId
    )}/events`;
    const url = input.eventId
      ? `${base}/${encodeURIComponent(input.eventId)}`
      : input.query
        ? `${base}?${input.query.toString()}`
        : base;
    return fetch(url, {
      method: input.method ?? "GET",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        ...(input.body ? { "Content-Type": "application/json" } : {}),
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      cache: "no-store",
    });
  },
};

export function getCalendarProvider(provider: string): CalendarProviderAdapter {
  if (provider === googleCalendarProvider.provider) return googleCalendarProvider;
  throw new Error("unsupported-calendar-provider");
}
