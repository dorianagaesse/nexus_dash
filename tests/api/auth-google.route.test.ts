import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const googleCalendarMock = vi.hoisted(() => ({
  GOOGLE_OAUTH_STATE_COOKIE: "nexusdash_google_oauth_state",
  GOOGLE_OAUTH_RETURN_TO_COOKIE: "nexusdash_google_oauth_return_to",
  buildGoogleOAuthUrl: vi.fn(),
  normalizeReturnToPath: vi.fn(),
}));

vi.mock("@/lib/google-calendar", () => ({
  GOOGLE_OAUTH_STATE_COOKIE: googleCalendarMock.GOOGLE_OAUTH_STATE_COOKIE,
  GOOGLE_OAUTH_RETURN_TO_COOKIE: googleCalendarMock.GOOGLE_OAUTH_RETURN_TO_COOKIE,
  buildGoogleOAuthUrl: googleCalendarMock.buildGoogleOAuthUrl,
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
    expect(typeof googleCalendarMock.buildGoogleOAuthUrl.mock.calls[0][0]).toBe("string");

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
});
