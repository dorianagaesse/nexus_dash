import { beforeEach, describe, expect, test, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  session: {
    findUnique: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("node:crypto", async () => {
  const actual = await vi.importActual<typeof import("node:crypto")>("node:crypto");

  return {
    ...actual,
    randomBytes: vi.fn(() => Buffer.from("a".repeat(32))),
  };
});

import {
  createSessionForUser,
  deleteAllOtherSessionsForUser,
  deleteSessionByToken,
  hashSessionToken,
  resolveSessionUserIdByToken,
} from "@/lib/services/session-service";

describe("session-service secure storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("resolves sessions by hashed token lookup", async () => {
    prismaMock.session.findUnique.mockResolvedValueOnce({
      userId: "user-1",
      expires: new Date(Date.now() + 60_000),
    });

    const result = await resolveSessionUserIdByToken("session-token");

    expect(result).toBe("user-1");
    expect(prismaMock.session.findUnique).toHaveBeenCalledWith({
      where: {
        sessionTokenHash: hashSessionToken("session-token"),
      },
      select: {
        userId: true,
        expires: true,
      },
    });
  });

  test("creates sessions with hashed storage but returns the raw token", async () => {
    prismaMock.session.create.mockResolvedValueOnce({});

    const result = await createSessionForUser("user-1");

    expect(result.sessionToken.length).toBeGreaterThan(0);
    expect(prismaMock.session.create).toHaveBeenCalledWith({
      data: {
        sessionTokenHash: hashSessionToken(result.sessionToken),
        userId: "user-1",
        expires: expect.any(Date),
      },
    });
  });

  test("deletes sessions by hashed token", async () => {
    await deleteSessionByToken("session-token");

    expect(prismaMock.session.deleteMany).toHaveBeenCalledWith({
      where: {
        sessionTokenHash: hashSessionToken("session-token"),
      },
    });
  });

  test("keeps only the hashed current session during bulk revocation", async () => {
    await deleteAllOtherSessionsForUser("user-1", "session-token");

    expect(prismaMock.session.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        NOT: {
          sessionTokenHash: hashSessionToken("session-token"),
        },
      },
    });
  });
});
