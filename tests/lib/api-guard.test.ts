import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const sessionUserMock = vi.hoisted(() => ({
  getSessionUserIdFromRequest: vi.fn(),
}));

vi.mock("@/lib/auth/session-user", () => ({
  getSessionUserIdFromRequest: sessionUserMock.getSessionUserIdFromRequest,
}));

import { requireAuthenticatedApiUser } from "@/lib/auth/api-guard";

describe("api-guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns 401 unauthorized response when no session user exists", async () => {
    sessionUserMock.getSessionUserIdFromRequest.mockResolvedValueOnce(null);
    const request = new NextRequest("http://localhost/api/calendar/events");

    const result = await requireAuthenticatedApiUser(request);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.response.status).toBe(401);
    await expect(result.response.json()).resolves.toEqual({
      error: "unauthorized",
    });
  });

  test("returns authenticated user id when session is valid", async () => {
    sessionUserMock.getSessionUserIdFromRequest.mockResolvedValueOnce("user-1");
    const request = new NextRequest("http://localhost/api/projects/p1/tasks");

    const result = await requireAuthenticatedApiUser(request);

    expect(result).toEqual({
      ok: true,
      userId: "user-1",
    });
  });
});
