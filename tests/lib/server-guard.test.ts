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
const headersMock = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({ headers: headersMock }));

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
    headersMock.mockResolvedValue(new Headers());
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

  test("preserves shared task destinations through sign-in", async () => {
    sessionUserMock.getSessionUserIdFromServer.mockResolvedValueOnce(null);
    headersMock.mockResolvedValueOnce(new Headers({
      "x-nexusdash-return-to": "/projects/demo?taskId=task-1",
    }));
    redirectMock.mockImplementationOnce(() => { throw new Error("NEXT_REDIRECT"); });
    await expect(requireSessionUserIdFromServer()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/?returnTo=%2Fprojects%2Fdemo%3FtaskId%3Dtask-1");
  });

  test("rejects external return destinations", async () => {
    sessionUserMock.getSessionUserIdFromServer.mockResolvedValueOnce(null);
    headersMock.mockResolvedValueOnce(new Headers({ "x-nexusdash-return-to": "https://example.com" }));
    redirectMock.mockImplementationOnce(() => { throw new Error("NEXT_REDIRECT"); });
    await expect(requireSessionUserIdFromServer()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/");
  });

  test("preserves shared task destinations through verification", async () => {
    sessionUserMock.getSessionUserIdFromServer.mockResolvedValueOnce("user-1");
    emailVerificationMock.isEmailVerifiedForUser.mockResolvedValueOnce(false);
    headersMock.mockResolvedValueOnce(new Headers({ "x-nexusdash-return-to": "/projects/demo?taskId=task-1" }));
    redirectMock.mockImplementationOnce(() => { throw new Error("NEXT_REDIRECT"); });
    await expect(requireVerifiedSessionUserIdFromServer()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/verify-email?returnTo=%2Fprojects%2Fdemo%3FtaskId%3Dtask-1");
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
