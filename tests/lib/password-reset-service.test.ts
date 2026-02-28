import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  passwordResetToken: {
    count: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
    findUnique: vi.fn(),
    updateMany: vi.fn(),
  },
  session: {
    deleteMany: vi.fn(),
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
  PASSWORD_RESET_RESEND_DAILY_LIMIT,
  PASSWORD_RESET_RESEND_COOLDOWN_SECONDS,
  requestPasswordResetForEmail,
  resetPasswordWithToken,
  validatePasswordResetToken,
} from "@/lib/services/password-reset-service";

describe("password-reset-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-27T12:00:00.000Z"));

    transactionalEmailMock.sendTransactionalEmail.mockResolvedValue({
      ok: true,
      delivery: "sent",
    });

    prismaMock.$transaction.mockImplementation(async (callback) => {
      return callback({
        passwordResetToken: {
          count: prismaMock.passwordResetToken.count,
          findFirst: prismaMock.passwordResetToken.findFirst,
          create: prismaMock.passwordResetToken.create,
          findUnique: prismaMock.passwordResetToken.findUnique,
          updateMany: prismaMock.passwordResetToken.updateMany,
          deleteMany: prismaMock.passwordResetToken.deleteMany,
        },
        user: {
          update: prismaMock.user.update,
        },
        session: {
          deleteMany: prismaMock.session.deleteMany,
        },
      });
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("skips reset request for invalid email input", async () => {
    const result = await requestPasswordResetForEmail({
      emailRaw: "not-an-email",
      requestOrigin: "https://nexus-dash.app",
    });

    expect(result).toEqual({
      ok: true,
      status: 202,
      data: {
        delivery: "skipped",
      },
    });
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  test("skips reset request when matching credentials account does not exist", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null);

    const result = await requestPasswordResetForEmail({
      emailRaw: "user@example.com",
      requestOrigin: "https://nexus-dash.app",
    });

    expect(result).toEqual({
      ok: true,
      status: 202,
      data: {
        delivery: "skipped",
      },
    });
    expect(transactionalEmailMock.sendTransactionalEmail).not.toHaveBeenCalled();
  });

  test("returns reset-cooldown when request is too soon", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "user-1",
      email: "user@example.com",
      passwordHash: "hash-1",
    });
    prismaMock.passwordResetToken.count.mockResolvedValueOnce(1);
    prismaMock.passwordResetToken.findFirst.mockResolvedValueOnce({
      createdAt: new Date(
        Date.now() - (PASSWORD_RESET_RESEND_COOLDOWN_SECONDS - 10) * 1000
      ),
    });

    const result = await requestPasswordResetForEmail({
      emailRaw: "user@example.com",
      requestOrigin: "https://nexus-dash.app",
    });

    expect(result).toEqual({
      ok: false,
      status: 429,
      error: "reset-cooldown",
    });
    expect(prismaMock.passwordResetToken.create).not.toHaveBeenCalled();
  });

  test("returns reset-limit-reached when daily resend cap is reached", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "user-1",
      email: "user@example.com",
      passwordHash: "hash-1",
    });
    prismaMock.passwordResetToken.count.mockResolvedValueOnce(
      PASSWORD_RESET_RESEND_DAILY_LIMIT
    );
    prismaMock.passwordResetToken.findFirst.mockResolvedValueOnce(null);

    const result = await requestPasswordResetForEmail({
      emailRaw: "user@example.com",
      requestOrigin: "https://nexus-dash.app",
    });

    expect(result).toEqual({
      ok: false,
      status: 429,
      error: "reset-limit-reached",
    });
    expect(prismaMock.passwordResetToken.create).not.toHaveBeenCalled();
    expect(transactionalEmailMock.sendTransactionalEmail).not.toHaveBeenCalled();
  });

  test("creates token and sends reset email for eligible request", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "user-1",
      email: "USER@example.com",
      passwordHash: "hash-1",
    });
    prismaMock.passwordResetToken.count.mockResolvedValueOnce(0);
    prismaMock.passwordResetToken.findFirst.mockResolvedValueOnce(null);
    prismaMock.passwordResetToken.create.mockResolvedValueOnce({
      id: "prt_1",
    });

    const result = await requestPasswordResetForEmail({
      emailRaw: "USER@example.com",
      requestOrigin: "https://nexus-dash.app",
    });

    expect(result).toEqual({
      ok: true,
      status: 202,
      data: {
        delivery: "sent",
      },
    });
    expect(prismaMock.passwordResetToken.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        email: "user@example.com",
        tokenHash: expect.any(String),
        expiresAt: expect.any(Date),
      },
      select: {
        id: true,
      },
    });
    expect(transactionalEmailMock.sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "user@example.com",
        subject: expect.any(String),
        html: expect.stringContaining("Reset password"),
      })
    );
  });

  test("deletes reset token when email provider fails", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "user-1",
      email: "user@example.com",
      passwordHash: "hash-1",
    });
    prismaMock.passwordResetToken.count.mockResolvedValueOnce(0);
    prismaMock.passwordResetToken.findFirst.mockResolvedValueOnce(null);
    prismaMock.passwordResetToken.create.mockResolvedValueOnce({
      id: "prt_1",
    });
    transactionalEmailMock.sendTransactionalEmail.mockResolvedValueOnce({
      ok: false,
      error: "provider-rejected",
    });

    const result = await requestPasswordResetForEmail({
      emailRaw: "user@example.com",
      requestOrigin: "https://nexus-dash.app",
    });

    expect(result).toEqual({
      ok: false,
      status: 503,
      error: "password-reset-email-send-failed",
    });
    expect(prismaMock.passwordResetToken.deleteMany).toHaveBeenCalledWith({
      where: { id: "prt_1" },
    });
  });

  test("falls back to default app origin when request origin protocol is invalid", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "user-1",
      email: "user@example.com",
      passwordHash: "hash-1",
    });
    prismaMock.passwordResetToken.count.mockResolvedValueOnce(0);
    prismaMock.passwordResetToken.findFirst.mockResolvedValueOnce(null);
    prismaMock.passwordResetToken.create.mockResolvedValueOnce({
      id: "prt_1",
    });

    const result = await requestPasswordResetForEmail({
      emailRaw: "user@example.com",
      requestOrigin: "javascript:alert(1)",
    });

    expect(result).toEqual({
      ok: true,
      status: 202,
      data: {
        delivery: "sent",
      },
    });
    expect(transactionalEmailMock.sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining("http://localhost:3000/reset-password?token="),
      })
    );
  });

  test("validatePasswordResetToken rejects expired token", async () => {
    prismaMock.passwordResetToken.findUnique.mockResolvedValueOnce({
      userId: "user-1",
      email: "user@example.com",
      consumedAt: null,
      expiresAt: new Date("2026-02-27T11:59:59.000Z"),
      user: {
        email: "user@example.com",
      },
    });

    const result = await validatePasswordResetToken("raw-token");

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "token-expired",
    });
  });

  test("resetPasswordWithToken rotates password and revokes sessions", async () => {
    prismaMock.passwordResetToken.findUnique.mockResolvedValueOnce({
      id: "prt_1",
      userId: "user-1",
      email: "user@example.com",
      consumedAt: null,
      expiresAt: new Date("2026-02-27T13:00:00.000Z"),
      user: {
        email: "user@example.com",
      },
    });
    prismaMock.passwordResetToken.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 2 });
    prismaMock.user.update.mockResolvedValueOnce({ id: "user-1" });
    prismaMock.session.deleteMany.mockResolvedValueOnce({ count: 3 });

    const result = await resetPasswordWithToken({
      rawToken: "raw-token",
      newPasswordRaw: "StrongPass!1",
      newPasswordConfirmationRaw: "StrongPass!1",
    });

    expect(result).toEqual({
      ok: true,
      status: 200,
      data: {
        userId: "user-1",
        sessionsRevoked: true,
      },
    });
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        passwordHash: expect.any(String),
      },
    });
    expect(prismaMock.session.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
      },
    });
  });

  test("resetPasswordWithToken rejects consumed token replay", async () => {
    prismaMock.passwordResetToken.findUnique.mockResolvedValueOnce({
      id: "prt_1",
      userId: "user-1",
      email: "user@example.com",
      consumedAt: new Date("2026-02-27T12:10:00.000Z"),
      expiresAt: new Date("2026-02-27T13:00:00.000Z"),
      user: {
        email: "user@example.com",
      },
    });

    const result = await resetPasswordWithToken({
      rawToken: "raw-token",
      newPasswordRaw: "StrongPass!1",
      newPasswordConfirmationRaw: "StrongPass!1",
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "token-expired",
    });
  });

  test("resetPasswordWithToken rejects password confirmation mismatch", async () => {
    const result = await resetPasswordWithToken({
      rawToken: "raw-token",
      newPasswordRaw: "StrongPass!1",
      newPasswordConfirmationRaw: "StrongPass!2",
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "password-confirmation-mismatch",
    });
    expect(prismaMock.passwordResetToken.findUnique).not.toHaveBeenCalled();
  });
});
