import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const googleCalendarMock = vi.hoisted(() => ({
  GOOGLE_OAUTH_ACTOR_COOKIE: "nexusdash_google_oauth_actor",
  GOOGLE_OAUTH_STATE_COOKIE: "nexusdash_google_oauth_state",
  GOOGLE_OAUTH_RETURN_TO_COOKIE: "nexusdash_google_oauth_return_to",
  buildGoogleOAuthUrl: vi.fn(),
  resolveGoogleOAuthRedirectUri: vi.fn(),
  normalizeReturnToPath: vi.fn(),
}));

vi.mock("@/lib/google-calendar", () => ({
  GOOGLE_OAUTH_ACTOR_COOKIE: googleCalendarMock.GOOGLE_OAUTH_ACTOR_COOKIE,
  GOOGLE_OAUTH_STATE_COOKIE: googleCalendarMock.GOOGLE_OAUTH_STATE_COOKIE,
  GOOGLE_OAUTH_RETURN_TO_COOKIE: googleCalendarMock.GOOGLE_OAUTH_RETURN_TO_COOKIE,
  buildGoogleOAuthUrl: googleCalendarMock.buildGoogleOAuthUrl,
  resolveGoogleOAuthRedirectUri: googleCalendarMock.resolveGoogleOAuthRedirectUri,
  normalizeReturnToPath: googleCalendarMock.normalizeReturnToPath,
}));

import { GET } from "@/app/api/auth/google/route";

function readSetCookieHeaders(response: Response): string {
  return response.headers.get("set-cookie") ?? "";
}

describe("GET /api/auth/google", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    googleCalendarMock.normalizeReturnToPath.mockReturnValue("/projects");
    googleCalendarMock.resolveGoogleOAuthRedirectUri.mockReturnValue(
      "http://localhost/api/auth/callback/google"
    );
    googleCalendarMock.buildGoogleOAuthUrl.mockReturnValue(
      "https://accounts.example.com/oauth?state=test-state"
    );
  });

  test("redirects to oauth provider and sets state + returnTo cookies", async () => {
    googleCalendarMock.normalizeReturnToPath.mockReturnValue("/projects/p1");

    const response = await GET(
      new NextRequest("http://localhost/api/auth/google?returnTo=/projects/p1")
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://accounts.example.com/oauth?state=test-state"
    );
    expect(googleCalendarMock.buildGoogleOAuthUrl).toHaveBeenCalledTimes(1);
    expect(googleCalendarMock.resolveGoogleOAuthRedirectUri).toHaveBeenCalledWith();
    expect(typeof googleCalendarMock.buildGoogleOAuthUrl.mock.calls[0][0]).toBe("string");
    expect(googleCalendarMock.buildGoogleOAuthUrl.mock.calls[0][1]).toBe(
      "http://localhost/api/auth/callback/google"
    );

    const setCookie = readSetCookieHeaders(response);
    expect(setCookie).toContain("nexusdash_google_oauth_state=");
    expect(setCookie).toContain("nexusdash_google_oauth_return_to=%2Fprojects%2Fp1");
  });

  test("redirects back with config error when oauth url build fails", async () => {
    googleCalendarMock.normalizeReturnToPath.mockReturnValue("/projects/p2");
    googleCalendarMock.buildGoogleOAuthUrl.mockImplementationOnce(() => {
      throw new Error("missing-env");
    });

    const response = await GET(
      new NextRequest("http://localhost/api/auth/google?returnTo=/projects/p2")
    );

    expect(response.status).toBe(307);
    const location = response.headers.get("location");
    expect(location).toBe("http://localhost/projects/p2?error=calendar-config-missing");
  });

  test("falls back to request origin when explicit redirect uri is not configured", async () => {
    googleCalendarMock.normalizeReturnToPath.mockReturnValue("/projects/p3");
    googleCalendarMock.resolveGoogleOAuthRedirectUri.mockImplementation(
      (origin?: string) => {
        if (!origin) {
          throw new Error("missing-google-redirect-uri");
        }

        return `${origin}/api/auth/callback/google`;
      }
    );

    const response = await GET(
      new NextRequest("http://localhost/api/auth/google?returnTo=/projects/p3")
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://accounts.example.com/oauth?state=test-state"
    );
    expect(googleCalendarMock.resolveGoogleOAuthRedirectUri).toHaveBeenNthCalledWith(1);
    expect(googleCalendarMock.resolveGoogleOAuthRedirectUri).toHaveBeenNthCalledWith(
      2,
      "http://localhost:3000"
    );
    expect(googleCalendarMock.buildGoogleOAuthUrl.mock.calls[0][1]).toBe(
      "http://localhost:3000/api/auth/callback/google"
    );
  });
});
