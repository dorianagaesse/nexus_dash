import { beforeEach, describe, expect, test, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  user: {
    create: vi.fn(),
    findUnique: vi.fn(),
  },
}));

const sessionServiceMock = vi.hoisted(() => ({
  createSessionForUser: vi.fn(),
}));

const passwordServiceMock = vi.hoisted(() => ({
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/services/session-service", () => ({
  createSessionForUser: sessionServiceMock.createSessionForUser,
}));

vi.mock("@/lib/services/password-service", () => ({
  hashPassword: passwordServiceMock.hashPassword,
  verifyPassword: passwordServiceMock.verifyPassword,
}));

import {
  MIN_PASSWORD_LENGTH,
  signInWithEmailPassword,
  signUpWithEmailPassword,
} from "@/lib/services/credential-auth-service";

describe("credential-auth-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionServiceMock.createSessionForUser.mockResolvedValue({
      sessionToken: "session-token",
      expiresAt: new Date("2026-03-01T00:00:00.000Z"),
    });
  });

  test("signUp rejects invalid email", async () => {
    const result = await signUpWithEmailPassword({
      emailRaw: "invalid-email",
      passwordRaw: "password123",
    });

    expect(result).toEqual({
      ok: false,
      error: "invalid-email",
    });
    expect(passwordServiceMock.hashPassword).not.toHaveBeenCalled();
  });

  test("signUp rejects short passwords", async () => {
    const result = await signUpWithEmailPassword({
      emailRaw: "user@example.com",
      passwordRaw: "x".repeat(MIN_PASSWORD_LENGTH - 1),
    });

    expect(result).toEqual({
      ok: false,
      error: "password-too-short",
    });
    expect(passwordServiceMock.hashPassword).not.toHaveBeenCalled();
  });

  test("signUp rejects passwords longer than 128 characters", async () => {
    const result = await signUpWithEmailPassword({
      emailRaw: "user@example.com",
      passwordRaw: "x".repeat(129),
    });

    expect(result).toEqual({
      ok: false,
      error: "password-too-long",
    });
    expect(passwordServiceMock.hashPassword).not.toHaveBeenCalled();
  });

  test("signUp returns email-in-use when unique constraint fails", async () => {
    passwordServiceMock.hashPassword.mockResolvedValueOnce("hash-1");
    prismaMock.user.create.mockRejectedValueOnce({ code: "P2002" });

    const result = await signUpWithEmailPassword({
      emailRaw: "user@example.com",
      passwordRaw: "password123",
    });

    expect(result).toEqual({
      ok: false,
      error: "email-in-use",
    });
  });

  test("signUp creates user, session, and normalizes email", async () => {
    passwordServiceMock.hashPassword.mockResolvedValueOnce("hash-1");
    prismaMock.user.create.mockResolvedValueOnce({ id: "user-1" });

    const result = await signUpWithEmailPassword({
      emailRaw: "  USER@Example.com ",
      passwordRaw: "password123",
    });

    expect(prismaMock.user.create).toHaveBeenCalledWith({
      data: {
        email: "user@example.com",
        passwordHash: "hash-1",
      },
      select: {
        id: true,
      },
    });
    expect(sessionServiceMock.createSessionForUser).toHaveBeenCalledWith("user-1");
    expect(result).toEqual({
      ok: true,
      data: {
        userId: "user-1",
        sessionToken: "session-token",
        expiresAt: new Date("2026-03-01T00:00:00.000Z"),
      },
    });
  });

  test("signIn returns invalid credentials when user is missing", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null);

    const result = await signInWithEmailPassword({
      emailRaw: "user@example.com",
      passwordRaw: "password123",
    });

    expect(result).toEqual({
      ok: false,
      error: "invalid-credentials",
    });
    expect(passwordServiceMock.verifyPassword).not.toHaveBeenCalled();
  });

  test("signIn returns invalid credentials when password is too long", async () => {
    const result = await signInWithEmailPassword({
      emailRaw: "user@example.com",
      passwordRaw: "x".repeat(129),
    });

    expect(result).toEqual({
      ok: false,
      error: "invalid-credentials",
    });
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  test("signIn returns invalid credentials when password does not match", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "user-1",
      passwordHash: "hash-1",
    });
    passwordServiceMock.verifyPassword.mockResolvedValueOnce(false);

    const result = await signInWithEmailPassword({
      emailRaw: "user@example.com",
      passwordRaw: "password123",
    });

    expect(result).toEqual({
      ok: false,
      error: "invalid-credentials",
    });
  });

  test("signIn creates session on valid credentials", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "user-1",
      passwordHash: "hash-1",
    });
    passwordServiceMock.verifyPassword.mockResolvedValueOnce(true);

    const result = await signInWithEmailPassword({
      emailRaw: "user@example.com",
      passwordRaw: "password123",
    });

    expect(passwordServiceMock.verifyPassword).toHaveBeenCalledWith(
      "password123",
      "hash-1"
    );
    expect(sessionServiceMock.createSessionForUser).toHaveBeenCalledWith("user-1");
    expect(result).toEqual({
      ok: true,
      data: {
        userId: "user-1",
        sessionToken: "session-token",
        expiresAt: new Date("2026-03-01T00:00:00.000Z"),
      },
    });
  });
});
