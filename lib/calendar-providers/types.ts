export interface CalendarProviderIdentity {
  accountId: string;
  email: string | null;
  label: string;
}

export interface CalendarProviderSource {
  providerCalendarId: string;
  name: string;
  color: string | null;
  timeZone: string | null;
  accessRole: string | null;
  isPrimary: boolean;
  writable: boolean;
}

export interface CalendarProviderTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  tokenType?: string;
  scope?: string;
}

export interface CalendarProviderAdapter {
  readonly provider: string;
  buildAuthorizationUrl(state: string, redirectUri: string): string;
  exchangeAuthorizationCode(code: string, redirectUri: string): Promise<CalendarProviderTokens>;
  identify(accessToken: string): Promise<CalendarProviderIdentity>;
  refresh(refreshToken: string): Promise<CalendarProviderTokens>;
  revoke(refreshToken: string): Promise<boolean>;
  discoverCalendars(accessToken: string): Promise<CalendarProviderSource[]>;
  requestEvents(input: {
    accessToken: string;
    calendarId: string;
    query?: URLSearchParams;
    eventId?: string;
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    body?: unknown;
  }): Promise<Response>;
}
