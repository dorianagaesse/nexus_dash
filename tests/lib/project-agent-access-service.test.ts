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
    const issuedAt = new Date("2026-03-31T09:00:00.000Z");

    const result = await recordAgentRequestUsage({
      credentialId: "credential-1",
      ownerUserId: "owner-1",
      projectId: "project-1",
      tokenId: "token-1",
      issuedAt,
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
        revokedAt: null,
        AND: [
          {
            OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
          },
          {
            OR: [{ lastRotatedAt: null }, { lastRotatedAt: { lte: issuedAt } }],
          },
        ],
      },
      data: {
        lastUsedAt: expect.any(Date),
      },
    });
  });

  test("returns a stable 500 when usage persistence fails unexpectedly", async () => {
    prismaMock.$transaction.mockRejectedValueOnce(new Error("db-down"));

    const result = await recordAgentRequestUsage({
      credentialId: "credential-1",
      ownerUserId: "owner-1",
      projectId: "project-1",
      tokenId: "token-1",
      issuedAt: new Date("2026-03-31T09:00:00.000Z"),
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
