import { beforeEach, describe, expect, test, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  apiCredential: {
    update: vi.fn(),
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
    prismaMock.apiCredential.update.mockReturnValue({
      __mock: "apiCredential.update",
    });
    prismaMock.authAuditEvent.create.mockReturnValue({
      __mock: "authAuditEvent.create",
    });
    prismaMock.$transaction.mockResolvedValue([]);
  });

  test("returns unauthorized when the backing credential disappears before usage is recorded", async () => {
    prismaMock.$transaction.mockRejectedValueOnce({ code: "P2025" });

    const result = await recordAgentRequestUsage({
      credentialId: "credential-1",
      ownerUserId: "owner-1",
      projectId: "project-1",
      tokenId: "token-1",
      requestId: "request-1",
      httpMethod: "GET",
      path: "/api/projects/project-1/tasks",
    });

    expect(result).toEqual({
      ok: false,
      status: 401,
      error: "unauthorized",
    });
  });

  test("returns a stable 500 when usage persistence fails unexpectedly", async () => {
    prismaMock.$transaction.mockRejectedValueOnce(new Error("db-down"));

    const result = await recordAgentRequestUsage({
      credentialId: "credential-1",
      ownerUserId: "owner-1",
      projectId: "project-1",
      tokenId: "token-1",
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
