import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const credentialServiceMock = vi.hoisted(() => ({
  upsertGoogleCalendarCredentialTokens: vi.fn(),
}));

const googleCalendarMock = vi.hoisted(() => ({
  GOOGLE_OAUTH_STATE_COOKIE: "nexusdash_google_oauth_state",
  GOOGLE_OAUTH_RETURN_TO_COOKIE: "nexusdash_google_oauth_return_to",
  GOOGLE_OAUTH_ACTOR_COOKIE: "nexusdash_google_oauth_actor",
  exchangeAuthorizationCodeForTokens: vi.fn(),
  normalizeReturnToPath: vi.fn(),
}));

vi.mock("@/lib/services/google-calendar-credential-service", () => ({
  upsertGoogleCalendarCredentialTokens:
    credentialServiceMock.upsertGoogleCalendarCredentialTokens,
}));

vi.mock("@/lib/google-calendar", () => ({
  GOOGLE_OAUTH_STATE_COOKIE: googleCalendarMock.GOOGLE_OAUTH_STATE_COOKIE,
  GOOGLE_OAUTH_RETURN_TO_COOKIE: googleCalendarMock.GOOGLE_OAUTH_RETURN_TO_COOKIE,
  GOOGLE_OAUTH_ACTOR_COOKIE: googleCalendarMock.GOOGLE_OAUTH_ACTOR_COOKIE,
  exchangeAuthorizationCodeForTokens:
    googleCalendarMock.exchangeAuthorizationCodeForTokens,
  normalizeReturnToPath: googleCalendarMock.normalizeReturnToPath,
}));

import { GET } from "@/app/api/auth/callback/google/route";

function createRequest(url: string, cookies: Record<string, string>): NextRequest {
  const cookieHeader = Object.entries(cookies)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("; ");

  return new NextRequest(url, {
    headers: cookieHeader.length > 0 ? { cookie: cookieHeader } : undefined,
  });
}

function readSetCookieHeaders(response: Response): string {
  return response.headers.get("set-cookie") ?? "";
}

describe("GET /api/auth/callback/google", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    googleCalendarMock.normalizeReturnToPath.mockImplementation((value: string | null) =>
      value && value.startsWith("/") ? value : "/projects"
    );
  });

  test("redirects with cancelled error when provider returns oauth error", async () => {
    const response = await GET(
      createRequest(
        "http://localhost/api/auth/callback/google?error=access_denied&state=abc",
        {
          nexusdash_google_oauth_state: "abc",
          nexusdash_google_oauth_return_to: "/projects/p1",
          nexusdash_google_oauth_actor: "user-1",
        }
      )
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/projects/p1?error=calendar-auth-cancelled"
    );
    expect(googleCalendarMock.exchangeAuthorizationCodeForTokens).not.toHaveBeenCalled();
    expect(
      credentialServiceMock.upsertGoogleCalendarCredentialTokens
    ).not.toHaveBeenCalled();

    const setCookie = readSetCookieHeaders(response);
    expect(setCookie).toContain("nexusdash_google_oauth_state=");
    expect(setCookie).toContain("Max-Age=0");
    expect(setCookie).toContain("nexusdash_google_oauth_return_to=");
  });

  test("redirects with state invalid when state does not match", async () => {
    const response = await GET(
      createRequest("http://localhost/api/auth/callback/google?state=wrong&code=abc", {
        nexusdash_google_oauth_state: "expected",
        nexusdash_google_oauth_return_to: "/projects/p1",
        nexusdash_google_oauth_actor: "user-1",
      })
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/projects/p1?error=calendar-auth-state-invalid"
    );
    expect(googleCalendarMock.exchangeAuthorizationCodeForTokens).not.toHaveBeenCalled();
  });

  test("redirects with code missing when code query is absent", async () => {
    const response = await GET(
      createRequest("http://localhost/api/auth/callback/google?state=expected", {
        nexusdash_google_oauth_state: "expected",
        nexusdash_google_oauth_return_to: "/projects/p1",
        nexusdash_google_oauth_actor: "user-1",
      })
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/projects/p1?error=calendar-auth-code-missing"
    );
    expect(googleCalendarMock.exchangeAuthorizationCodeForTokens).not.toHaveBeenCalled();
  });

  test("stores token payload through service and redirects with calendar-connected", async () => {
    googleCalendarMock.exchangeAuthorizationCodeForTokens.mockResolvedValueOnce({
      accessToken: "access-token",
      expiresIn: 3600,
      refreshToken: "refresh-token",
      tokenType: "Bearer",
      scope: "scope-a",
    });
    credentialServiceMock.upsertGoogleCalendarCredentialTokens.mockResolvedValueOnce(
      undefined
    );

    const response = await GET(
      createRequest(
        "http://localhost/api/auth/callback/google?state=expected&code=auth-code",
        {
          nexusdash_google_oauth_state: "expected",
          nexusdash_google_oauth_return_to: "/projects/p1",
          nexusdash_google_oauth_actor: "user-1",
        }
      )
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/projects/p1?status=calendar-connected"
    );
    expect(googleCalendarMock.exchangeAuthorizationCodeForTokens).toHaveBeenCalledWith(
      "auth-code"
    );
    expect(credentialServiceMock.upsertGoogleCalendarCredentialTokens).toHaveBeenCalledWith({
      userId: "user-1",
      accessToken: "access-token",
      expiresIn: 3600,
      refreshToken: "refresh-token",
      tokenType: "Bearer",
      scope: "scope-a",
    });
  });

  test("redirects with auth-failed when credential persistence fails", async () => {
    googleCalendarMock.exchangeAuthorizationCodeForTokens.mockResolvedValueOnce({
      accessToken: "access-token",
      expiresIn: 3600,
      tokenType: "Bearer",
      scope: "scope-a",
    });
    credentialServiceMock.upsertGoogleCalendarCredentialTokens.mockRejectedValueOnce(
      new Error("missing-refresh-token")
    );

    const response = await GET(
      createRequest(
        "http://localhost/api/auth/callback/google?state=expected&code=auth-code",
        {
          nexusdash_google_oauth_state: "expected",
          nexusdash_google_oauth_return_to: "/projects/p1",
          nexusdash_google_oauth_actor: "user-1",
        }
      )
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/projects/p1?error=calendar-auth-failed"
    );
  });
});
