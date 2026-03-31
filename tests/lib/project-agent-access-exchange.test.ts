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

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/services/password-service", () => ({
  verifySecret: passwordServiceMock.verifySecret,
}));

vi.mock("@/lib/auth/agent-token-service", () => ({
  issueAgentAccessToken: agentTokenServiceMock.issueAgentAccessToken,
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
});
