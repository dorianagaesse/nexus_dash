import { ApiCredentialScope } from "@prisma/client";
import { beforeEach, describe, expect, test, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  apiCredential: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  authAuditEvent: {
    create: vi.fn(),
  },
}));

const passwordServiceMock = vi.hoisted(() => ({
  verifySecret: vi.fn(),
}));

const agentTokenServiceMock = vi.hoisted(() => ({
  issueAgentAccessToken: vi.fn(),
}));

const abuseControlServiceMock = vi.hoisted(() => ({
  buildAuthRateLimitKey: vi.fn((namespace: string, value: string | null | undefined) =>
    value ? `${namespace}:${value}` : null
  ),
  buildCompositeAuthRateLimitKey: vi.fn(
    (namespace: string, values: Array<string | null | undefined>) =>
      values.every((value) => typeof value === "string" && value.trim().length > 0)
        ? `${namespace}:${values.join("|")}`
        : null
  ),
  checkAuthAbuseControls: vi.fn(),
  clearAuthAbuseControls: vi.fn(),
  registerAuthAbuseFailure: vi.fn(),
}));

const loggerMock = vi.hoisted(() => ({
  logServerWarning: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/services/password-service", () => ({
  verifySecret: passwordServiceMock.verifySecret,
}));

vi.mock("@/lib/auth/agent-token-service", () => ({
  issueAgentAccessToken: agentTokenServiceMock.issueAgentAccessToken,
}));

vi.mock("@/lib/services/auth-abuse-control-service", () => ({
  buildAuthRateLimitKey: abuseControlServiceMock.buildAuthRateLimitKey,
  buildCompositeAuthRateLimitKey: abuseControlServiceMock.buildCompositeAuthRateLimitKey,
  checkAuthAbuseControls: abuseControlServiceMock.checkAuthAbuseControls,
  clearAuthAbuseControls: abuseControlServiceMock.clearAuthAbuseControls,
  registerAuthAbuseFailure: abuseControlServiceMock.registerAuthAbuseFailure,
  AuthRateLimitScope: {
    agent_token_exchange: "agent_token_exchange",
  },
}));

vi.mock("@/lib/observability/logger", () => ({
  logServerWarning: loggerMock.logServerWarning,
}));

import { exchangeAgentApiKeyForAccessToken } from "@/lib/services/project-agent-access-service";

describe("exchangeAgentApiKeyForAccessToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.apiCredential.update.mockReturnValue({
      __mock: "apiCredential.update",
    });
    prismaMock.authAuditEvent.create.mockReturnValue({
      __mock: "authAuditEvent.create",
    });
    prismaMock.$transaction.mockResolvedValue([]);
    abuseControlServiceMock.checkAuthAbuseControls.mockResolvedValue({ ok: true });
    abuseControlServiceMock.registerAuthAbuseFailure.mockResolvedValue({ ok: true });
    abuseControlServiceMock.clearAuthAbuseControls.mockResolvedValue(undefined);
    passwordServiceMock.verifySecret.mockResolvedValue(true);
    agentTokenServiceMock.issueAgentAccessToken.mockReturnValue({
      accessToken: "issued-token",
      tokenId: "token-1",
      issuedAt: new Date("2026-03-31T10:00:00.000Z"),
      expiresAt: new Date("2026-03-31T10:10:00.000Z"),
      expiresInSeconds: 600,
    });
  });

  test("uses createdByUserId as the owner identity when issuing tokens", async () => {
    prismaMock.apiCredential.findUnique.mockResolvedValueOnce({
      id: "credential-1",
      label: "Preview validation bot",
      secretHash: "hashed-secret",
      publicId: "nda_public",
      projectId: "project-1",
      createdByUserId: "owner-1",
      expiresAt: null,
      revokedAt: null,
      scopeGrants: [{ scope: ApiCredentialScope.task_read }],
    });

    const result = await exchangeAgentApiKeyForAccessToken({
      apiKey: "nda_public.secret-value",
      requestId: "request-123",
      ipAddress: "198.51.100.12",
      userAgent: "Vitest",
    });

    expect(result).toEqual({
      ok: true,
      status: 200,
      data: {
        accessToken: "issued-token",
        tokenType: "Bearer",
        expiresAt: "2026-03-31T10:10:00.000Z",
        expiresInSeconds: 600,
        projectId: "project-1",
        scopes: ["task:read"],
      },
    });
    expect(passwordServiceMock.verifySecret).toHaveBeenCalledWith(
      "secret-value",
      "hashed-secret"
    );
    expect(agentTokenServiceMock.issueAgentAccessToken).toHaveBeenCalledWith({
      credentialId: "credential-1",
      projectId: "project-1",
      ownerUserId: "owner-1",
      scopes: ["task:read"],
    });
    expect(prismaMock.apiCredential.findUnique).toHaveBeenCalledWith({
      where: {
        publicId: "nda_public",
      },
      select: {
        id: true,
        label: true,
        secretHash: true,
        publicId: true,
        projectId: true,
        createdByUserId: true,
        expiresAt: true,
        revokedAt: true,
        scopeGrants: {
          orderBy: [{ scope: "asc" }],
          select: {
            scope: true,
          },
        },
      },
    });
  });

  test("returns too-many-attempts when abuse controls are already active", async () => {
    abuseControlServiceMock.checkAuthAbuseControls.mockResolvedValueOnce({
      ok: false,
      retryAfterSeconds: 600,
    });

    const result = await exchangeAgentApiKeyForAccessToken({
      apiKey: "nda_public.secret-value",
      requestId: "request-123",
      ipAddress: "198.51.100.12",
      userAgent: "Vitest",
    });

    expect(result).toEqual({
      ok: false,
      status: 429,
      error: "too-many-attempts",
    });
  });

  test("still issues a token when abuse-control cleanup fails after a valid exchange", async () => {
    prismaMock.apiCredential.findUnique.mockResolvedValueOnce({
      id: "credential-1",
      label: "Preview validation bot",
      secretHash: "hashed-secret",
      publicId: "nda_public",
      projectId: "project-1",
      createdByUserId: "owner-1",
      expiresAt: null,
      revokedAt: null,
      scopeGrants: [{ scope: ApiCredentialScope.task_read }],
    });
    abuseControlServiceMock.clearAuthAbuseControls.mockRejectedValueOnce(
      new Error("cleanup-down")
    );

    const result = await exchangeAgentApiKeyForAccessToken({
      apiKey: "nda_public.secret-value",
      requestId: "request-123",
      ipAddress: "198.51.100.12",
      userAgent: "Vitest",
    });

    expect(result).toEqual({
      ok: true,
      status: 200,
      data: {
        accessToken: "issued-token",
        tokenType: "Bearer",
        expiresAt: "2026-03-31T10:10:00.000Z",
        expiresInSeconds: 600,
        projectId: "project-1",
        scopes: ["task:read"],
      },
    });
    expect(loggerMock.logServerWarning).toHaveBeenCalledWith(
      "projectAgentAccess.tokenExchangeAbuseControlsClearFailed",
      expect.any(String),
      expect.objectContaining({
        requestId: "request-123",
        ipAddress: "198.51.100.12",
        userAgent: "Vitest",
        credentialId: "credential-1",
        publicId: "nda_public",
      })
    );
  });
});
