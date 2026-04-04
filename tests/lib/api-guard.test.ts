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

const agentTokenServiceMock = vi.hoisted(() => ({
  verifyAgentAccessToken: vi.fn(),
}));

const projectAgentAccessServiceMock = vi.hoisted(() => ({
  recordAgentRequestUsage: vi.fn(),
}));

const loggerMock = vi.hoisted(() => ({
  logServerError: vi.fn(),
}));

vi.mock("@/lib/auth/session-user", () => ({
  getSessionUserIdFromRequest: sessionUserMock.getSessionUserIdFromRequest,
}));

vi.mock("@/lib/services/email-verification-service", () => ({
  isEmailVerifiedForUser: emailVerificationMock.isEmailVerifiedForUser,
}));

vi.mock("@/lib/auth/agent-token-service", () => ({
  verifyAgentAccessToken: agentTokenServiceMock.verifyAgentAccessToken,
}));

vi.mock("@/lib/services/project-agent-access-service", () => ({
  recordAgentRequestUsage: projectAgentAccessServiceMock.recordAgentRequestUsage,
}));

vi.mock("@/lib/observability/logger", () => ({
  logServerError: loggerMock.logServerError,
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

import {
  getAgentProjectAccessContext,
  requireApiPrincipal,
  requireAuthenticatedApiUser,
} from "@/lib/auth/api-guard";

describe("api-guard", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    envMock.getRuntimeEnvironment.mockReturnValue("test");
    envMock.getOptionalServerEnv.mockReturnValue(null);
    envMock.isLiveProductionDeployment.mockReturnValue(false);
    emailVerificationMock.isEmailVerifiedForUser.mockResolvedValue(true);
    projectAgentAccessServiceMock.recordAgentRequestUsage.mockResolvedValue({
      ok: true,
      status: 200,
      data: { ok: true },
    });
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
    await expect(result.response.json()).resolves.toEqual({
      error: "email-unverified",
    });
  });

  test("returns stable 500 when live-production verification lookup throws", async () => {
    envMock.getRuntimeEnvironment.mockReturnValue("production");
    envMock.isLiveProductionDeployment.mockReturnValue(true);
    sessionUserMock.getSessionUserIdFromRequest.mockResolvedValueOnce("user-1");
    const verificationError = new Error("db-down");
    emailVerificationMock.isEmailVerifiedForUser.mockRejectedValueOnce(
      verificationError
    );
    const request = new NextRequest("http://localhost/api/projects/p1/tasks");

    const result = await requireAuthenticatedApiUser(request);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.response.status).toBe(500);
    await expect(result.response.json()).resolves.toEqual({
      error: "auth-check-failed",
    });
    expect(loggerMock.logServerError).toHaveBeenCalledWith(
      "requireAuthenticatedApiUser.emailVerificationCheck",
      verificationError,
      {
        actorUserId: "user-1",
      }
    );
  });

  test("rejects bearer tokens on human-only routes", async () => {
    const request = new NextRequest("http://localhost/api/calendar/events", {
      headers: {
        authorization: "Bearer agent-access-token",
      },
    });

    const result = await requireAuthenticatedApiUser(request);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.response.status).toBe(401);
    await expect(result.response.json()).resolves.toEqual({
      error: "unauthorized",
    });
    expect(sessionUserMock.getSessionUserIdFromRequest).not.toHaveBeenCalled();
  });

  test("resolves a bearer token into an agent principal and records request usage", async () => {
    agentTokenServiceMock.verifyAgentAccessToken.mockReturnValueOnce({
      ok: true,
      data: {
        credentialId: "credential-1",
        projectId: "project-1",
        ownerUserId: "owner-1",
        scopes: ["task:read"],
        tokenId: "token-1",
        issuedAt: new Date("2026-03-31T09:00:00.000Z"),
        expiresAt: new Date("2026-03-31T09:10:00.000Z"),
      },
    });

    const request = new NextRequest("http://localhost/api/projects/project-1/tasks", {
      headers: {
        authorization: "Bearer signed-agent-token",
        "x-forwarded-for": "198.51.100.24, 10.0.0.1",
        "x-request-id": "request-123",
        "user-agent": "Vitest",
      },
    });

    const result = await requireApiPrincipal(request);

    expect(result).toEqual({
      ok: true,
      principal: {
        kind: "agent",
        actorUserId: "owner-1",
        ownerUserId: "owner-1",
        credentialId: "credential-1",
        projectId: "project-1",
        scopes: ["task:read"],
        tokenId: "token-1",
        requestId: "request-123",
      },
    });
    expect(projectAgentAccessServiceMock.recordAgentRequestUsage).toHaveBeenCalledWith({
      credentialId: "credential-1",
      ownerUserId: "owner-1",
      projectId: "project-1",
      tokenId: "token-1",
      requestId: "request-123",
      ipAddress: "198.51.100.24",
      userAgent: "Vitest",
      httpMethod: "GET",
      path: "/api/projects/project-1/tasks",
    });
  });

  test("prefers bearer auth over session auth when both are present", async () => {
    agentTokenServiceMock.verifyAgentAccessToken.mockReturnValueOnce({
      ok: false,
      status: 401,
      error: "unauthorized",
    });
    sessionUserMock.getSessionUserIdFromRequest.mockResolvedValueOnce("user-1");

    const request = new NextRequest("http://localhost/api/projects/project-1/tasks", {
      headers: {
        authorization: "Bearer invalid-token",
      },
    });

    const result = await requireApiPrincipal(request);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.response.status).toBe(401);
    await expect(result.response.json()).resolves.toEqual({
      error: "unauthorized",
    });
    expect(sessionUserMock.getSessionUserIdFromRequest).not.toHaveBeenCalled();
  });

  test("surfaces audit-write failures for agent requests", async () => {
    agentTokenServiceMock.verifyAgentAccessToken.mockReturnValueOnce({
      ok: true,
      data: {
        credentialId: "credential-1",
        projectId: "project-1",
        ownerUserId: "owner-1",
        scopes: ["task:read"],
        tokenId: "token-1",
        issuedAt: new Date("2026-03-31T09:00:00.000Z"),
        expiresAt: new Date("2026-03-31T09:10:00.000Z"),
      },
    });
    projectAgentAccessServiceMock.recordAgentRequestUsage.mockResolvedValueOnce({
      ok: false,
      status: 500,
      error: "audit-write-failed",
    });

    const request = new NextRequest("http://localhost/api/projects/project-1/tasks", {
      headers: {
        authorization: "Bearer signed-agent-token",
      },
    });

    const result = await requireApiPrincipal(request);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.response.status).toBe(500);
    await expect(result.response.json()).resolves.toEqual({
      error: "audit-write-failed",
    });
    expect(loggerMock.logServerError).toHaveBeenCalledWith(
      "requireApiPrincipal.recordAgentRequestUsage",
      "audit-write-failed",
      expect.objectContaining({
        credentialId: "credential-1",
        projectId: "project-1",
        status: 500,
      })
    );
  });

  test("logs and returns a stable 500 when agent usage persistence throws", async () => {
    agentTokenServiceMock.verifyAgentAccessToken.mockReturnValueOnce({
      ok: true,
      data: {
        credentialId: "credential-1",
        projectId: "project-1",
        ownerUserId: "owner-1",
        scopes: ["task:read"],
        tokenId: "token-1",
        issuedAt: new Date("2026-03-31T09:00:00.000Z"),
        expiresAt: new Date("2026-03-31T09:10:00.000Z"),
      },
    });
    const dbError = new Error("db-down");
    projectAgentAccessServiceMock.recordAgentRequestUsage.mockRejectedValueOnce(dbError);

    const request = new NextRequest("http://localhost/api/projects/project-1/tasks", {
      headers: {
        authorization: "Bearer signed-agent-token",
      },
    });

    const result = await requireApiPrincipal(request);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.response.status).toBe(500);
    await expect(result.response.json()).resolves.toEqual({
      error: "agent-usage-not-recorded",
    });
    expect(loggerMock.logServerError).toHaveBeenCalledWith(
      "requireApiPrincipal.recordAgentRequestUsage",
      dbError,
      expect.objectContaining({
        credentialId: "credential-1",
        projectId: "project-1",
      })
    );
  });

  test("returns a human principal when no bearer token is present", async () => {
    sessionUserMock.getSessionUserIdFromRequest.mockResolvedValueOnce("user-1");

    const request = new NextRequest("http://localhost/api/projects/project-1/tasks");
    const result = await requireApiPrincipal(request);

    expect(result).toEqual({
      ok: true,
      principal: {
        kind: "human",
        actorUserId: "user-1",
        requestId: expect.any(String),
      },
    });
  });

  test("maps agent principals into project-scope context", () => {
    expect(
      getAgentProjectAccessContext({
        kind: "human",
        actorUserId: "user-1",
        requestId: "request-1",
      })
    ).toBeUndefined();

    expect(
      getAgentProjectAccessContext({
        kind: "agent",
        actorUserId: "owner-1",
        ownerUserId: "owner-1",
        credentialId: "credential-1",
        projectId: "project-1",
        scopes: ["task:write"],
        tokenId: "token-1",
        requestId: "request-1",
      })
    ).toEqual({
      credentialId: "credential-1",
      projectId: "project-1",
      scopes: ["task:write"],
    });
  });
});
