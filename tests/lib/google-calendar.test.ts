import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  buildGoogleOAuthUrl,
  createExpiryDate,
  exchangeAuthorizationCodeForTokens,
  getGoogleCalendarId,
  getGoogleOAuthEnv,
  normalizeReturnToPath,
  parseTokenResponse,
  refreshAccessToken,
} from "@/lib/google-calendar";

describe("google-calendar", () => {
  beforeEach(() => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "client-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "client-secret");
    vi.stubEnv("GOOGLE_REDIRECT_URI", "http://localhost:3000/api/auth/google/callback");
    vi.stubEnv("GOOGLE_CALENDAR_ID", "calendar@example.com");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  test("reads oauth env values", () => {
    expect(getGoogleOAuthEnv()).toEqual({
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "http://localhost:3000/api/auth/google/callback",
    });
  });

  test("returns configured calendar id with fallback", () => {
    expect(getGoogleCalendarId()).toBe("calendar@example.com");
    vi.stubEnv("GOOGLE_CALENDAR_ID", "");
    expect(getGoogleCalendarId()).toBe("primary");
  });

  test("builds oauth url with required params", () => {
    const url = new URL(buildGoogleOAuthUrl("state-token"));

    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("state")).toBe("state-token");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe(
      "https://www.googleapis.com/auth/calendar.events"
    );
  });

  test("parses valid token response", () => {
    const parsed = parseTokenResponse({
      access_token: "access",
      expires_in: 1200,
      refresh_token: "refresh",
      token_type: "Bearer",
      scope: "scope",
    });

    expect(parsed).toEqual({
      accessToken: "access",
      expiresIn: 1200,
      refreshToken: "refresh",
      tokenType: "Bearer",
      scope: "scope",
    });
  });

  test("throws on invalid token response payload", () => {
    expect(() => parseTokenResponse(null)).toThrow("Invalid token response from Google");
    expect(() =>
      parseTokenResponse({ access_token: "a", expires_in: "bad" })
    ).toThrow("Token response is missing access_token or expires_in");
  });

  test("normalizes return path", () => {
    expect(normalizeReturnToPath(null)).toBe("/projects");
    expect(normalizeReturnToPath("/projects/p1")).toBe("/projects/p1");
    expect(normalizeReturnToPath("//malicious.com")).toBe("/projects");
    expect(normalizeReturnToPath("//malicious.com/path")).toBe("/projects");
    expect(normalizeReturnToPath("https://external")).toBe("/projects");
  });

  test("creates near-future expiry date", () => {
    const start = Date.now();
    const expiry = createExpiryDate(120);
    const deltaMs = expiry.getTime() - start;

    expect(deltaMs).toBeGreaterThanOrEqual(89_000);
    expect(deltaMs).toBeLessThanOrEqual(120_000);
  });

  test("exchanges authorization code for tokens", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: "acc", expires_in: 3600, token_type: "Bearer" }),
        { status: 200 }
      )
    );

    const response = await exchangeAuthorizationCodeForTokens("code-123");

    expect(response.accessToken).toBe("acc");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe("https://oauth2.googleapis.com/token");
  });

  test("refreshes access token and surfaces error code", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })
    );

    await expect(refreshAccessToken("bad-refresh")).rejects.toThrow("invalid_grant");
  });
});
