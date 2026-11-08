import { beforeEach, describe, expect, test, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  apiCredential: {
    updateMany: vi.fn(),
  },
  authAuditEvent: {
    create: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import { recordAgentRequestUsage } from "@/lib/services/project-agent-access-service";

describe("project-agent-access-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.apiCredential.updateMany.mockResolvedValue({
      count: 1,
    });
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof prismaMock) => unknown) =>
      callback(prismaMock)
    );
  });

  test("returns unauthorized when the backing credential disappears before usage is recorded", async () => {
    prismaMock.apiCredential.updateMany.mockResolvedValueOnce({ count: 0 });

    const result = await recordAgentRequestUsage({
      credentialId: "credential-1",
      ownerUserId: "owner-1",
      projectId: "project-1",
      tokenId: "token-1",
      credentialPublicId: "nda_generation1",
      requestId: "request-1",
      httpMethod: "GET",
      path: "/api/projects/project-1/tasks",
    });

    expect(result).toEqual({
      ok: false,
      status: 401,
      error: "unauthorized",
    });
    expect(prismaMock.apiCredential.updateMany).toHaveBeenCalledWith({
      where: {
        id: "credential-1",
        projectId: "project-1",
        createdByUserId: "owner-1",
        identityMode: false,
        revokedAt: null,
        publicId: "nda_generation1",
        AND: [
          {
            OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
          },
        ],
      },
      data: {
        lastUsedAt: expect.any(Date),
      },
    });
  });

  test("runtime sessions use device authorization independently of legacy key generations", async () => {
    await recordAgentRequestUsage({
      credentialId: "credential-1", ownerUserId: "owner-1", projectId: "project-1",
      tokenId: "token-1", sessionId: "session-1", deviceId: "device-1", credentialPublicId: "old-generation",
    });
    const where = prismaMock.apiCredential.updateMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ project: { ownerId: "owner-1" }, revokedAt: null });
    expect(where).not.toHaveProperty("publicId");
    expect(where).not.toHaveProperty("lastRotatedAt");
    expect(where).not.toHaveProperty("createdByUserId");
  });

  test("only accepts legacy tokens on never-rotated credentials", async () => {
    await recordAgentRequestUsage({
      credentialId: "credential-1", ownerUserId: "owner-1", projectId: "project-1", tokenId: "token-1",
    });
    expect(prismaMock.apiCredential.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ lastRotatedAt: null, revokedAt: null }),
    }));
    expect(prismaMock.apiCredential.updateMany.mock.calls[0][0].where).not.toHaveProperty("publicId");
  });

  test("returns a stable 500 when usage persistence fails unexpectedly", async () => {
    prismaMock.apiCredential.updateMany.mockRejectedValueOnce(new Error("db-down"));

    const result = await recordAgentRequestUsage({
      credentialId: "credential-1",
      ownerUserId: "owner-1",
      projectId: "project-1",
      tokenId: "token-1",
      credentialPublicId: "nda_generation1",
      requestId: "request-1",
      httpMethod: "GET",
      path: "/api/projects/project-1/tasks",
    });

    expect(result).toEqual({
      ok: false,
      status: 500,
      error: "agent-usage-not-recorded",
    });
  });
});
