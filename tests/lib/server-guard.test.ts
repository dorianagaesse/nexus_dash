import { beforeEach, describe, expect, test, vi } from "vitest";

const sessionUserMock = vi.hoisted(() => ({
  getSessionUserIdFromServer: vi.fn(),
}));

const emailVerificationMock = vi.hoisted(() => ({
  isEmailVerifiedForUser: vi.fn(),
}));

const redirectMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session-user", () => ({
  getSessionUserIdFromServer: sessionUserMock.getSessionUserIdFromServer,
}));

vi.mock("@/lib/services/email-verification-service", () => ({
  isEmailVerifiedForUser: emailVerificationMock.isEmailVerifiedForUser,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

import {
  requireSessionUserIdFromServer,
  requireVerifiedSessionUserIdFromServer,
} from "@/lib/auth/server-guard";

describe("server-guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    emailVerificationMock.isEmailVerifiedForUser.mockResolvedValue(true);
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

  test("returns user id when session is verified", async () => {
    sessionUserMock.getSessionUserIdFromServer.mockResolvedValueOnce("user-1");
    emailVerificationMock.isEmailVerifiedForUser.mockResolvedValueOnce(true);

    const result = await requireVerifiedSessionUserIdFromServer();

    expect(result).toBe("user-1");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  test("redirects to verify-email when session is unverified", async () => {
    sessionUserMock.getSessionUserIdFromServer.mockResolvedValueOnce("user-1");
    emailVerificationMock.isEmailVerifiedForUser.mockResolvedValueOnce(false);
    redirectMock.mockImplementationOnce(() => {
      throw new Error("NEXT_REDIRECT");
    });

    await expect(requireVerifiedSessionUserIdFromServer()).rejects.toThrow(
      "NEXT_REDIRECT"
    );
    expect(redirectMock).toHaveBeenCalledWith("/verify-email");
  });
});
