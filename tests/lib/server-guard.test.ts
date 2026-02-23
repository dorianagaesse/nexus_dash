import { beforeEach, describe, expect, test, vi } from "vitest";

const sessionUserMock = vi.hoisted(() => ({
  getSessionUserIdFromServer: vi.fn(),
}));

const redirectMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session-user", () => ({
  getSessionUserIdFromServer: sessionUserMock.getSessionUserIdFromServer,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

import { requireSessionUserIdFromServer } from "@/lib/auth/server-guard";

describe("server-guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns user id when session is valid", async () => {
    sessionUserMock.getSessionUserIdFromServer.mockResolvedValueOnce("user-1");

    const result = await requireSessionUserIdFromServer();

    expect(result).toBe("user-1");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  test("redirects to home when session user is missing", async () => {
    sessionUserMock.getSessionUserIdFromServer.mockResolvedValueOnce(null);
    redirectMock.mockImplementationOnce(() => {
      throw new Error("NEXT_REDIRECT");
    });

    await expect(requireSessionUserIdFromServer()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/");
  });
});
