import { beforeEach, describe, expect, test, vi } from "vitest";

const sessionUserMock = vi.hoisted(() => ({
  getSessionUserIdFromServer: vi.fn(),
}));

const emailVerificationMock = vi.hoisted(() => ({
  isEmailVerifiedForUser: vi.fn(),
}));

const envMock = vi.hoisted(() => ({
  isLiveProductionDeployment: vi.fn(),
}));

const redirectMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session-user", () => ({
  getSessionUserIdFromServer: sessionUserMock.getSessionUserIdFromServer,
}));

vi.mock("@/lib/services/email-verification-service", () => ({
  isEmailVerifiedForUser: emailVerificationMock.isEmailVerifiedForUser,
}));

vi.mock("@/lib/env.server", () => ({
  isLiveProductionDeployment: envMock.isLiveProductionDeployment,
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
    envMock.isLiveProductionDeployment.mockReturnValue(true);
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

  test("skips verification gate when deployment is not live production", async () => {
    sessionUserMock.getSessionUserIdFromServer.mockResolvedValueOnce("user-1");
    envMock.isLiveProductionDeployment.mockReturnValueOnce(false);

    const result = await requireVerifiedSessionUserIdFromServer();

    expect(result).toBe("user-1");
    expect(emailVerificationMock.isEmailVerifiedForUser).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
