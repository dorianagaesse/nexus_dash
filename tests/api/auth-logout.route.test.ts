import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const sessionServiceMock = vi.hoisted(() => ({
  SESSION_COOKIE_NAMES: [
    "nexusdash.session-token",
    "__Secure-authjs.session-token",
    "authjs.session-token",
    "__Secure-next-auth.session-token",
    "next-auth.session-token",
  ],
  deleteSessionByToken: vi.fn(),
  readSessionTokensFromCookieReader: vi.fn(),
}));

const envServerMock = vi.hoisted(() => ({
  isProductionEnvironment: vi.fn(),
}));

const loggerMock = vi.hoisted(() => ({
  logServerError: vi.fn(),
}));

vi.mock("@/lib/services/session-service", () => ({
  SESSION_COOKIE_NAMES: sessionServiceMock.SESSION_COOKIE_NAMES,
  deleteSessionByToken: sessionServiceMock.deleteSessionByToken,
  readSessionTokensFromCookieReader:
    sessionServiceMock.readSessionTokensFromCookieReader,
}));

vi.mock("@/lib/env.server", () => ({
  isProductionEnvironment: envServerMock.isProductionEnvironment,
}));

vi.mock("@/lib/observability/logger", () => ({
  logServerError: loggerMock.logServerError,
}));

import { POST } from "@/app/api/auth/logout/route";

describe("auth logout route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envServerMock.isProductionEnvironment.mockReturnValue(false);
  });

  test("deletes current session and clears all supported session cookies", async () => {
    sessionServiceMock.readSessionTokensFromCookieReader.mockReturnValueOnce([
      "session-token-1",
    ]);

    const request = new NextRequest("http://localhost/api/auth/logout", {
      method: "POST",
      headers: {
        cookie: "authjs.session-token=session-token-1",
      },
    });

    const response = await POST(request);

    expect(sessionServiceMock.deleteSessionByToken).toHaveBeenCalledWith("session-token-1");
    expect(response.headers.get("location")).toBe("http://localhost/");

    const setCookieHeader = response.headers.get("set-cookie") ?? "";
    for (const cookieName of sessionServiceMock.SESSION_COOKIE_NAMES) {
      expect(setCookieHeader).toContain(`${cookieName}=;`);
    }
  });

  test("still clears cookies when no session token is present", async () => {
    sessionServiceMock.readSessionTokensFromCookieReader.mockReturnValueOnce([]);

    const request = new NextRequest("http://localhost/api/auth/logout", {
      method: "POST",
    });

    const response = await POST(request);

    expect(sessionServiceMock.deleteSessionByToken).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("http://localhost/");
  });

  test("logs delete failures and still redirects to home", async () => {
    sessionServiceMock.readSessionTokensFromCookieReader.mockReturnValueOnce([
      "session-token-1",
    ]);
    sessionServiceMock.deleteSessionByToken.mockRejectedValueOnce(
      new Error("db-down")
    );

    const request = new NextRequest("http://localhost/api/auth/logout", {
      method: "POST",
    });

    const response = await POST(request);

    expect(loggerMock.logServerError).toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("http://localhost/");
  });

  test("normalizes external returnTo values back to home", async () => {
    sessionServiceMock.readSessionTokensFromCookieReader.mockReturnValueOnce([]);

    const request = new NextRequest(
      "http://localhost/api/auth/logout?returnTo=https://evil.example/phish",
      {
        method: "POST",
      }
    );

    const response = await POST(request);

    expect(response.headers.get("location")).toBe("http://localhost/");
  });

  test("deletes every discovered session token before redirecting", async () => {
    sessionServiceMock.readSessionTokensFromCookieReader.mockReturnValueOnce([
      "current-session",
      "legacy-session",
    ]);

    const request = new NextRequest("http://localhost/api/auth/logout", {
      method: "POST",
      headers: {
        cookie:
          "nexusdash.session-token=current-session; authjs.session-token=legacy-session",
      },
    });

    await POST(request);

    expect(sessionServiceMock.deleteSessionByToken).toHaveBeenNthCalledWith(
      1,
      "current-session"
    );
    expect(sessionServiceMock.deleteSessionByToken).toHaveBeenNthCalledWith(
      2,
      "legacy-session"
    );
  });
});
