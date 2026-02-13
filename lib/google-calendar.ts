const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

export const GOOGLE_OAUTH_STATE_COOKIE = "nexusdash_google_oauth_state";
export const GOOGLE_OAUTH_RETURN_TO_COOKIE = "nexusdash_google_oauth_return_to";
export const GOOGLE_CALENDAR_CONNECTION_ID = "default";
export const DEFAULT_CALENDAR_EVENT_DAYS = 14;

interface GoogleOAuthEnv {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface GoogleTokenResponse {
  accessToken: string;
  expiresIn: number;
  refreshToken?: string;
  tokenType?: string;
  scope?: string;
}

function readEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getGoogleOAuthEnv(): GoogleOAuthEnv {
  return {
    clientId: readEnv("GOOGLE_CLIENT_ID"),
    clientSecret: readEnv("GOOGLE_CLIENT_SECRET"),
    redirectUri: readEnv("GOOGLE_REDIRECT_URI"),
  };
}

export function getGoogleCalendarId(): string {
  return process.env.GOOGLE_CALENDAR_ID?.trim() || "primary";
}

export function buildGoogleOAuthUrl(state: string): string {
  const env = getGoogleOAuthEnv();
  const params = new URLSearchParams({
    client_id: env.clientId,
    redirect_uri: env.redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: GOOGLE_CALENDAR_SCOPE,
    state,
  });

  return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}

export function parseTokenResponse(payload: unknown): GoogleTokenResponse {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid token response from Google");
  }

  const parsed = payload as {
    access_token?: unknown;
    expires_in?: unknown;
    refresh_token?: unknown;
    token_type?: unknown;
    scope?: unknown;
  };

  if (
    typeof parsed.access_token !== "string" ||
    typeof parsed.expires_in !== "number"
  ) {
    throw new Error("Token response is missing access_token or expires_in");
  }

  return {
    accessToken: parsed.access_token,
    expiresIn: parsed.expires_in,
    refreshToken:
      typeof parsed.refresh_token === "string" ? parsed.refresh_token : undefined,
    tokenType: typeof parsed.token_type === "string" ? parsed.token_type : undefined,
    scope: typeof parsed.scope === "string" ? parsed.scope : undefined,
  };
}

async function postTokenForm(
  body: URLSearchParams
): Promise<GoogleTokenResponse> {
  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as
    | Record<string, unknown>
    | null;

  if (!response.ok) {
    const errorCode =
      payload && typeof payload.error === "string"
        ? payload.error
        : "token-request-failed";
    throw new Error(errorCode);
  }

  return parseTokenResponse(payload);
}

export async function exchangeAuthorizationCodeForTokens(
  code: string
): Promise<GoogleTokenResponse> {
  const env = getGoogleOAuthEnv();
  const body = new URLSearchParams({
    code,
    client_id: env.clientId,
    client_secret: env.clientSecret,
    redirect_uri: env.redirectUri,
    grant_type: "authorization_code",
  });

  return postTokenForm(body);
}

export async function refreshAccessToken(
  refreshToken: string
): Promise<GoogleTokenResponse> {
  const env = getGoogleOAuthEnv();
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: env.clientId,
    client_secret: env.clientSecret,
    grant_type: "refresh_token",
  });

  return postTokenForm(body);
}

export function createExpiryDate(expiresInSeconds: number): Date {
  return new Date(Date.now() + Math.max(0, expiresInSeconds - 30) * 1000);
}

export function normalizeReturnToPath(value: string | null): string {
  if (!value) {
    return "/projects";
  }

  if (value.startsWith("/")) {
    return value;
  }

  return "/projects";
}
