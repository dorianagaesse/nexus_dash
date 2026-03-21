import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const sessionServiceMock = vi.hoisted(() => ({
  readSessionTokensFromCookieHeader: vi.fn(),
  readSessionTokensFromCookieReader: vi.fn(),
  resolveSessionUserIdByToken: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

vi.mock("@/lib/services/session-service", () => ({
  readSessionTokensFromCookieHeader:
    sessionServiceMock.readSessionTokensFromCookieHeader,
  readSessionTokensFromCookieReader:
    sessionServiceMock.readSessionTokensFromCookieReader,
  resolveSessionUserIdByToken: sessionServiceMock.resolveSessionUserIdByToken,
}));

import { getSessionUserIdFromRequest } from "@/lib/auth/session-user";

describe("session-user", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env.ENABLE_SYNTHETIC_TEST_USER;
    delete process.env.VITEST;
    sessionServiceMock.readSessionTokensFromCookieReader.mockReturnValue([]);
    sessionServiceMock.readSessionTokensFromCookieHeader.mockReturnValue([]);
  });

  test("prefers the current session cookie over legacy cookies", async () => {
    sessionServiceMock.readSessionTokensFromCookieReader.mockReturnValueOnce([
      "current-token",
      "legacy-token",
    ]);
    sessionServiceMock.resolveSessionUserIdByToken
      .mockResolvedValueOnce("user-current")
      .mockResolvedValueOnce("user-legacy");

    const request = new NextRequest("http://localhost/projects", {
      headers: {
        cookie:
          "nexusdash.session-token=current-token; authjs.session-token=legacy-token",
      },
    });

    const userId = await getSessionUserIdFromRequest(request);

    expect(userId).toBe("user-current");
    expect(sessionServiceMock.resolveSessionUserIdByToken).toHaveBeenCalledTimes(1);
    expect(sessionServiceMock.resolveSessionUserIdByToken).toHaveBeenCalledWith(
      "current-token"
    );
  });

  test("falls back to a valid legacy session when the current cookie is stale", async () => {
    sessionServiceMock.readSessionTokensFromCookieReader.mockReturnValueOnce([
      "stale-current-token",
      "legacy-token",
    ]);
    sessionServiceMock.resolveSessionUserIdByToken.mockImplementation(
      async (sessionToken: string) => {
        return sessionToken === "legacy-token" ? "user-legacy" : null;
      }
    );

    const request = new NextRequest("http://localhost/projects", {
      headers: {
        cookie:
          "nexusdash.session-token=stale-current-token; authjs.session-token=legacy-token",
      },
    });

    const userId = await getSessionUserIdFromRequest(request);

    expect(userId).toBe("user-legacy");
    expect(sessionServiceMock.resolveSessionUserIdByToken).toHaveBeenCalledWith(
      "legacy-token"
    );
  });
});
