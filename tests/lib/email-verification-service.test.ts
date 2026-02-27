import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  emailVerificationToken: {
    count: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
    findUnique: vi.fn(),
    updateMany: vi.fn(),
  },
  $transaction: vi.fn(),
}));

const transactionalEmailMock = vi.hoisted(() => ({
  sendTransactionalEmail: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/services/transactional-email-service", () => ({
  sendTransactionalEmail: transactionalEmailMock.sendTransactionalEmail,
}));

import {
  consumeEmailVerificationToken,
  EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS,
  getEmailVerificationStatus,
  issueEmailVerificationForUser,
} from "@/lib/services/email-verification-service";

describe("email-verification-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-27T10:00:00.000Z"));

    transactionalEmailMock.sendTransactionalEmail.mockResolvedValue({
      ok: true,
      delivery: "sent",
    });

    prismaMock.$transaction.mockImplementation(async (callback) => {
      return callback({
        emailVerificationToken: {
          count: prismaMock.emailVerificationToken.count,
          findFirst: prismaMock.emailVerificationToken.findFirst,
          create: prismaMock.emailVerificationToken.create,
          findUnique: prismaMock.emailVerificationToken.findUnique,
          updateMany: prismaMock.emailVerificationToken.updateMany,
        },
        user: {
          update: prismaMock.user.update,
        },
      });
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("returns unauthorized status for empty actor in status lookup", async () => {
    const result = await getEmailVerificationStatus("");

    expect(result).toEqual({
      ok: false,
      status: 401,
      error: "unauthorized",
    });
  });

  test("returns already-verified when trying to issue for verified account", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "user-1",
      email: "user@example.com",
      emailVerified: new Date("2026-02-20T00:00:00.000Z"),
    });

    const result = await issueEmailVerificationForUser({
      actorUserId: "user-1",
      requestOrigin: "https://nexus-dash.app",
    });

    expect(result).toEqual({
      ok: false,
      status: 409,
      error: "already-verified",
    });
    expect(transactionalEmailMock.sendTransactionalEmail).not.toHaveBeenCalled();
  });

  test("returns email-unavailable when user email is missing or invalid", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "user-1",
      email: null,
      emailVerified: null,
    });

    const result = await issueEmailVerificationForUser({
      actorUserId: "user-1",
      requestOrigin: "https://nexus-dash.app",
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "email-unavailable",
    });
    expect(prismaMock.emailVerificationToken.create).not.toHaveBeenCalled();
  });

  test("returns resend-cooldown when user requests too quickly", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "user-1",
      email: "user@example.com",
      emailVerified: null,
    });
    prismaMock.emailVerificationToken.count.mockResolvedValueOnce(1);
    prismaMock.emailVerificationToken.findFirst.mockResolvedValueOnce({
      createdAt: new Date(Date.now() - (EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS - 10) * 1000),
    });

    const result = await issueEmailVerificationForUser({
      actorUserId: "user-1",
      requestOrigin: "https://nexus-dash.app",
    });

    expect(result).toEqual({
      ok: false,
      status: 429,
      error: "resend-cooldown",
    });
    expect(prismaMock.emailVerificationToken.create).not.toHaveBeenCalled();
  });

  test("returns resend-limit-reached when daily resend cap is hit", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "user-1",
      email: "user@example.com",
      emailVerified: null,
    });
    prismaMock.emailVerificationToken.count.mockResolvedValueOnce(5);
    prismaMock.emailVerificationToken.findFirst.mockResolvedValueOnce(null);

    const result = await issueEmailVerificationForUser({
      actorUserId: "user-1",
      requestOrigin: "https://nexus-dash.app",
    });

    expect(result).toEqual({
      ok: false,
      status: 429,
      error: "resend-limit-reached",
    });
    expect(prismaMock.emailVerificationToken.create).not.toHaveBeenCalled();
  });

  test("creates token and sends email for eligible resend", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "user-1",
      email: "USER@example.com",
      emailVerified: null,
    });
    prismaMock.emailVerificationToken.count.mockResolvedValueOnce(0);
    prismaMock.emailVerificationToken.findFirst.mockResolvedValueOnce(null);
    prismaMock.emailVerificationToken.create.mockResolvedValueOnce({
      id: "evt_1",
      expiresAt: new Date("2026-02-27T11:00:00.000Z"),
    });

    const result = await issueEmailVerificationForUser({
      actorUserId: "user-1",
      requestOrigin: "https://nexus-dash.app",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.status).toBe(202);
    expect(result.data.delivery).toBe("sent");
    expect(prismaMock.emailVerificationToken.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        email: "user@example.com",
        tokenHash: expect.any(String),
        expiresAt: expect.any(Date),
      },
      select: {
        id: true,
        expiresAt: true,
      },
    });
    expect(transactionalEmailMock.sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "user@example.com",
        subject: expect.any(String),
        html: expect.stringContaining("Verify email"),
      })
    );
  });

  test("deletes token when provider delivery fails", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "user-1",
      email: "user@example.com",
      emailVerified: null,
    });
    prismaMock.emailVerificationToken.count.mockResolvedValueOnce(0);
    prismaMock.emailVerificationToken.findFirst.mockResolvedValueOnce(null);
    prismaMock.emailVerificationToken.create.mockResolvedValueOnce({
      id: "evt_1",
      expiresAt: new Date("2026-02-27T11:00:00.000Z"),
    });
    transactionalEmailMock.sendTransactionalEmail.mockResolvedValueOnce({
      ok: false,
      error: "provider-rejected",
    });

    const result = await issueEmailVerificationForUser({
      actorUserId: "user-1",
      requestOrigin: "https://nexus-dash.app",
    });

    expect(result).toEqual({
      ok: false,
      status: 503,
      error: "verification-email-send-failed",
    });
    expect(prismaMock.emailVerificationToken.deleteMany).toHaveBeenCalledWith({
      where: { id: "evt_1" },
    });
  });

  test("consumes valid token and verifies user", async () => {
    prismaMock.emailVerificationToken.findUnique.mockResolvedValueOnce({
      id: "evt_1",
      userId: "user-1",
      email: "user@example.com",
      expiresAt: new Date("2026-02-27T10:30:00.000Z"),
      consumedAt: null,
      user: {
        email: "user@example.com",
      },
    });
    prismaMock.emailVerificationToken.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.user.update.mockResolvedValueOnce({
      id: "user-1",
    });

    const result = await consumeEmailVerificationToken("raw-token");

    expect(result).toEqual({
      ok: true,
      status: 200,
      data: {
        userId: "user-1",
      },
    });
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        emailVerified: expect.any(Date),
      },
    });
  });

  test("rejects expired token", async () => {
    prismaMock.emailVerificationToken.findUnique.mockResolvedValueOnce({
      id: "evt_1",
      userId: "user-1",
      email: "user@example.com",
      expiresAt: new Date("2026-02-27T09:59:00.000Z"),
      consumedAt: null,
      user: {
        email: "user@example.com",
      },
    });

    const result = await consumeEmailVerificationToken("raw-token");

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "token-expired",
    });
  });

  test("rejects consumed token replay attempts", async () => {
    prismaMock.emailVerificationToken.findUnique.mockResolvedValueOnce({
      id: "evt_1",
      userId: "user-1",
      email: "user@example.com",
      expiresAt: new Date("2026-02-27T10:30:00.000Z"),
      consumedAt: new Date("2026-02-27T10:10:00.000Z"),
      user: {
        email: "user@example.com",
      },
    });

    const result = await consumeEmailVerificationToken("raw-token");

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "token-expired",
    });
  });

  test("rejects token when current user email no longer matches token email", async () => {
    prismaMock.emailVerificationToken.findUnique.mockResolvedValueOnce({
      id: "evt_1",
      userId: "user-1",
      email: "user@example.com",
      expiresAt: new Date("2026-02-27T10:30:00.000Z"),
      consumedAt: null,
      user: {
        email: "different@example.com",
      },
    });

    const result = await consumeEmailVerificationToken("raw-token");

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "token-expired",
    });
  });
});
