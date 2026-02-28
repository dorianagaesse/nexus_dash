import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const sessionUserMock = vi.hoisted(() => ({
  getSessionUserIdFromRequest: vi.fn(),
}));

const emailVerificationMock = vi.hoisted(() => ({
  isEmailVerifiedForUser: vi.fn(),
}));

const envMock = vi.hoisted(() => ({
  getRuntimeEnvironment: vi.fn(),
  getOptionalServerEnv: vi.fn(),
  isLiveProductionDeployment: vi.fn(),
}));

vi.mock("@/lib/auth/session-user", () => ({
  getSessionUserIdFromRequest: sessionUserMock.getSessionUserIdFromRequest,
}));

vi.mock("@/lib/services/email-verification-service", () => ({
  isEmailVerifiedForUser: emailVerificationMock.isEmailVerifiedForUser,
}));

vi.mock("@/lib/env.server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/env.server")>(
    "@/lib/env.server"
  );

  return {
    ...actual,
    getRuntimeEnvironment: envMock.getRuntimeEnvironment,
    getOptionalServerEnv: envMock.getOptionalServerEnv,
    isLiveProductionDeployment: envMock.isLiveProductionDeployment,
  };
});

import { requireAuthenticatedApiUser } from "@/lib/auth/api-guard";

describe("api-guard", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    envMock.getRuntimeEnvironment.mockReturnValue("test");
    envMock.getOptionalServerEnv.mockReturnValue(null);
    envMock.isLiveProductionDeployment.mockReturnValue(false);
    emailVerificationMock.isEmailVerifiedForUser.mockResolvedValue(true);
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
    emailVerificationMock.isEmailVerifiedForUser.mockResolvedValueOnce(true);
    const request = new NextRequest("http://localhost/api/projects/p1/tasks");

    const result = await requireAuthenticatedApiUser(request);

    expect(result).toEqual({
      ok: true,
      userId: "user-1",
    });
  });

  test("skips verification gate in test runtime for route-contract tests", async () => {
    sessionUserMock.getSessionUserIdFromRequest.mockResolvedValueOnce("user-1");
    const request = new NextRequest("http://localhost/api/projects/p1/tasks");

    const result = await requireAuthenticatedApiUser(request);
    expect(result).toEqual({
      ok: true,
      userId: "user-1",
    });
  });

  test("skips verification gate in preview production deployments", async () => {
    envMock.getRuntimeEnvironment.mockReturnValue("production");
    envMock.isLiveProductionDeployment.mockReturnValue(false);
    sessionUserMock.getSessionUserIdFromRequest.mockResolvedValueOnce("user-1");
    const request = new NextRequest("http://localhost/api/projects/p1/tasks");

    const result = await requireAuthenticatedApiUser(request);
    expect(result).toEqual({
      ok: true,
      userId: "user-1",
    });
  });

  test("enforces verification gate in live production deployments", async () => {
    envMock.getRuntimeEnvironment.mockReturnValue("production");
    envMock.isLiveProductionDeployment.mockReturnValue(true);
    sessionUserMock.getSessionUserIdFromRequest.mockResolvedValueOnce("user-1");
    emailVerificationMock.isEmailVerifiedForUser.mockResolvedValueOnce(false);
    const request = new NextRequest("http://localhost/api/projects/p1/tasks");

    const result = await requireAuthenticatedApiUser(request);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.response.status).toBe(403);
  });
});
