import { beforeEach, describe, expect, test, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}));

const passwordServiceMock = vi.hoisted(() => ({
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
}));

const sessionServiceMock = vi.hoisted(() => ({
  deleteAllOtherSessionsForUser: vi.fn(),
}));

const cryptoMock = vi.hoisted(() => ({
  randomInt: vi.fn(),
}));

vi.mock("node:crypto", () => ({
  randomInt: cryptoMock.randomInt,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/services/password-service", () => ({
  hashPassword: passwordServiceMock.hashPassword,
  verifyPassword: passwordServiceMock.verifyPassword,
}));

vi.mock("@/lib/services/session-service", () => ({
  deleteAllOtherSessionsForUser: sessionServiceMock.deleteAllOtherSessionsForUser,
}));

import {
  getAccountProfile,
  updateAccountEmail,
  updateAccountPassword,
  updateAccountUsername,
} from "@/lib/services/account-profile-service";

describe("account-profile-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cryptoMock.randomInt.mockReturnValue(1);
  });

  test("returns unauthorized profile result for missing actor", async () => {
    const result = await getAccountProfile(" ");

    expect(result).toEqual({
      ok: false,
      status: 401,
      error: "unauthorized",
    });
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  test("returns profile summary for authenticated user", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      email: "user@example.com",
      emailVerified: new Date("2026-02-27T00:00:00.000Z"),
      username: "test.user",
      usernameDiscriminator: "1234",
    });

    const result = await getAccountProfile("user-1");

    expect(result).toEqual({
      ok: true,
      status: 200,
      data: {
        email: "user@example.com",
        isEmailVerified: true,
        username: "test.user",
        usernameDiscriminator: "1234",
        usernameTag: "test.user#1234",
      },
    });
  });

  test("sanitizes legacy non-numeric discriminator in profile summary", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      email: "user@example.com",
      emailVerified: new Date("2026-02-27T00:00:00.000Z"),
      username: "test.user",
      usernameDiscriminator: "abc123",
    });

    const result = await getAccountProfile("user-1");

    expect(result).toEqual({
      ok: true,
      status: 200,
      data: {
        email: "user@example.com",
        isEmailVerified: true,
        username: "test.user",
        usernameDiscriminator: null,
        usernameTag: null,
      },
    });
  });

  test("returns profile with nullable identity fields for legacy users", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      email: "legacy@example.com",
      emailVerified: null,
      username: null,
      usernameDiscriminator: null,
    });

    const result = await getAccountProfile("user-1");

    expect(result).toEqual({
      ok: true,
      status: 200,
      data: {
        email: "legacy@example.com",
        isEmailVerified: false,
        username: "",
        usernameDiscriminator: null,
        usernameTag: null,
      },
    });
  });

  test("rejects email update with invalid email", async () => {
    const result = await updateAccountEmail({
      actorUserId: "user-1",
      emailRaw: "invalid",
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "invalid-email",
    });
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  test("rejects cross-user email updates", async () => {
    const result = await updateAccountEmail({
      actorUserId: "user-1",
      subjectUserId: "user-2",
      emailRaw: "new@example.com",
    });

    expect(result).toEqual({
      ok: false,
      status: 403,
      error: "forbidden",
    });
  });

  test("returns unchanged when email stays the same after normalization", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      email: "user@example.com",
    });

    const result = await updateAccountEmail({
      actorUserId: "user-1",
      emailRaw: " USER@example.com ",
    });

    expect(result).toEqual({
      ok: true,
      status: 200,
      data: {
        email: "user@example.com",
        emailChanged: false,
      },
    });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  test("updates email, resets verification, and clears prior verification tokens", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      email: "before@example.com",
    });
    prismaMock.user.update.mockResolvedValueOnce({
      email: "after@example.com",
    });

    const result = await updateAccountEmail({
      actorUserId: "user-1",
      emailRaw: "After@example.com",
    });

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        email: "after@example.com",
        emailVerified: null,
        emailVerificationTokens: {
          deleteMany: {},
        },
      },
      select: {
        email: true,
      },
    });
    expect(result).toEqual({
      ok: true,
      status: 200,
      data: {
        email: "after@example.com",
        emailChanged: true,
      },
    });
  });

  test("returns email-in-use on unique email constraint violation", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      email: "before@example.com",
    });
    prismaMock.user.update.mockRejectedValueOnce({
      code: "P2002",
      meta: {
        target: ["email"],
      },
    });

    const result = await updateAccountEmail({
      actorUserId: "user-1",
      emailRaw: "new@example.com",
    });

    expect(result).toEqual({
      ok: false,
      status: 409,
      error: "email-in-use",
    });
  });

  test("rejects username updates with invalid value", async () => {
    const result = await updateAccountUsername({
      actorUserId: "user-1",
      usernameRaw: "Invalid Name",
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "invalid-username",
    });
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  test("rejects cross-user username updates", async () => {
    const result = await updateAccountUsername({
      actorUserId: "user-1",
      subjectUserId: "user-2",
      usernameRaw: "test.user",
    });

    expect(result).toEqual({
      ok: false,
      status: 403,
      error: "forbidden",
    });
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  test("updates username and keeps discriminator when no collision occurs", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      username: "before",
      usernameDiscriminator: "1111",
    });
    prismaMock.user.update.mockResolvedValueOnce({
      username: "after",
      usernameDiscriminator: "1111",
    });

    const result = await updateAccountUsername({
      actorUserId: "user-1",
      usernameRaw: "AFTER",
    });

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        username: "after",
        usernameDiscriminator: "1111",
        name: "after",
      },
      select: {
        username: true,
        usernameDiscriminator: true,
      },
    });
    expect(result).toEqual({
      ok: true,
      status: 200,
      data: {
        username: "after",
        usernameDiscriminator: "1111",
        usernameTag: "after#1111",
        discriminatorRegenerated: false,
      },
    });
  });

  test("regenerates discriminator when username/discriminator pair collides", async () => {
    cryptoMock.randomInt.mockReturnValueOnce(2);
    prismaMock.user.findUnique.mockResolvedValueOnce({
      username: "before",
      usernameDiscriminator: "1111",
    });
    prismaMock.user.update
      .mockRejectedValueOnce({
        code: "P2002",
        meta: {
          target: ["username", "usernameDiscriminator"],
        },
      })
      .mockResolvedValueOnce({
        username: "after",
        usernameDiscriminator: "0002",
      });

    const result = await updateAccountUsername({
      actorUserId: "user-1",
      usernameRaw: "after",
    });

    expect(prismaMock.user.update).toHaveBeenCalledTimes(2);
    expect(prismaMock.user.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          usernameDiscriminator: "0002",
        }),
      })
    );
    expect(result).toEqual({
      ok: true,
      status: 200,
      data: {
        username: "after",
        usernameDiscriminator: "0002",
        usernameTag: "after#0002",
        discriminatorRegenerated: true,
      },
    });
  });

  test("generates discriminator when user has legacy null discriminator", async () => {
    cryptoMock.randomInt.mockReturnValueOnce(5);
    prismaMock.user.findUnique.mockResolvedValueOnce({
      username: "before",
      usernameDiscriminator: null,
    });
    prismaMock.user.update.mockResolvedValueOnce({
      username: "after",
      usernameDiscriminator: "0005",
    });

    const result = await updateAccountUsername({
      actorUserId: "user-1",
      usernameRaw: "after",
    });

    expect(result).toEqual({
      ok: true,
      status: 200,
      data: {
        username: "after",
        usernameDiscriminator: "0005",
        usernameTag: "after#0005",
        discriminatorRegenerated: true,
      },
    });
  });

  test("regenerates discriminator when user has legacy non-numeric discriminator", async () => {
    cryptoMock.randomInt.mockReturnValueOnce(7);
    prismaMock.user.findUnique.mockResolvedValueOnce({
      username: "before",
      usernameDiscriminator: "ab12cd",
    });
    prismaMock.user.update.mockResolvedValueOnce({
      username: "after",
      usernameDiscriminator: "0007",
    });

    const result = await updateAccountUsername({
      actorUserId: "user-1",
      usernameRaw: "after",
    });

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        username: "after",
        usernameDiscriminator: "0007",
        name: "after",
      },
      select: {
        username: true,
        usernameDiscriminator: true,
      },
    });
    expect(result).toEqual({
      ok: true,
      status: 200,
      data: {
        username: "after",
        usernameDiscriminator: "0007",
        usernameTag: "after#0007",
        discriminatorRegenerated: true,
      },
    });
  });

  test("returns username-in-use when repeated collisions exceed retry budget", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      username: "before",
      usernameDiscriminator: "1111",
    });
    prismaMock.user.update.mockRejectedValue({
      code: "P2002",
      meta: {
        target: ["username", "usernameDiscriminator"],
      },
    });

    const result = await updateAccountUsername({
      actorUserId: "user-1",
      usernameRaw: "after",
    });

    expect(result).toEqual({
      ok: false,
      status: 409,
      error: "username-in-use",
    });
  });

  test("rejects password updates when current password does not match", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      passwordHash: "hash-1",
    });
    passwordServiceMock.verifyPassword.mockResolvedValueOnce(false);

    const result = await updateAccountPassword({
      actorUserId: "user-1",
      currentPasswordRaw: "Wrong123!",
      newPasswordRaw: "NewPassword123!",
      newPasswordConfirmationRaw: "NewPassword123!",
      currentSessionToken: "session-token",
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "invalid-current-password",
    });
    expect(passwordServiceMock.hashPassword).not.toHaveBeenCalled();
    expect(sessionServiceMock.deleteAllOtherSessionsForUser).not.toHaveBeenCalled();
  });

  test("rejects password updates when new password is too short", async () => {
    const result = await updateAccountPassword({
      actorUserId: "user-1",
      currentPasswordRaw: "Current123!",
      newPasswordRaw: "Aa1!",
      newPasswordConfirmationRaw: "Aa1!",
      currentSessionToken: "session-token",
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "password-too-short",
    });
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    expect(passwordServiceMock.verifyPassword).not.toHaveBeenCalled();
  });

  test("rejects password updates when new password is too long", async () => {
    const tooLongPassword = `A${"a".repeat(127)}!1`;
    const result = await updateAccountPassword({
      actorUserId: "user-1",
      currentPasswordRaw: "Current123!",
      newPasswordRaw: tooLongPassword,
      newPasswordConfirmationRaw: tooLongPassword,
      currentSessionToken: "session-token",
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "password-too-long",
    });
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    expect(passwordServiceMock.verifyPassword).not.toHaveBeenCalled();
  });

  test("rejects password updates when new password requirements are not met", async () => {
    const result = await updateAccountPassword({
      actorUserId: "user-1",
      currentPasswordRaw: "Current123!",
      newPasswordRaw: "alllowercase123!",
      newPasswordConfirmationRaw: "alllowercase123!",
      currentSessionToken: "session-token",
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "password-requirements-not-met",
    });
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    expect(passwordServiceMock.verifyPassword).not.toHaveBeenCalled();
  });

  test("rejects password updates when confirmation does not match", async () => {
    const result = await updateAccountPassword({
      actorUserId: "user-1",
      currentPasswordRaw: "Current123!",
      newPasswordRaw: "NewPassword123!",
      newPasswordConfirmationRaw: "DifferentPassword123!",
      currentSessionToken: "session-token",
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "password-confirmation-mismatch",
    });
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    expect(passwordServiceMock.verifyPassword).not.toHaveBeenCalled();
  });

  test("updates password and revokes all other sessions", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      passwordHash: "hash-1",
    });
    passwordServiceMock.verifyPassword.mockResolvedValueOnce(true);
    passwordServiceMock.hashPassword.mockResolvedValueOnce("hash-2");
    prismaMock.user.update.mockResolvedValueOnce({
      id: "user-1",
    });

    const result = await updateAccountPassword({
      actorUserId: "user-1",
      currentPasswordRaw: "Current123!",
      newPasswordRaw: "NewPassword123!",
      newPasswordConfirmationRaw: "NewPassword123!",
      currentSessionToken: "session-token",
    });

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        passwordHash: "hash-2",
      },
    });
    expect(sessionServiceMock.deleteAllOtherSessionsForUser).toHaveBeenCalledWith(
      "user-1",
      "session-token"
    );
    expect(result).toEqual({
      ok: true,
      status: 200,
      data: {
        sessionsRevoked: true,
      },
    });
  });
});
