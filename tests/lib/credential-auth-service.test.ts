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
  consumeAuthAbuseQuota: vi.fn(),
  registerAuthAbuseFailure: vi.fn(),
}));

const cryptoMock = vi.hoisted(() => ({
  randomInt: vi.fn(),
}));

const envMock = vi.hoisted(() => ({
  isPreviewDeployment: vi.fn(() => false),
}));

const loggerMock = vi.hoisted(() => ({
  logServerWarning: vi.fn(),
}));

vi.mock("node:crypto", () => ({
  randomInt: cryptoMock.randomInt,
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

vi.mock("@/lib/services/auth-abuse-control-service", () => ({
  buildAuthRateLimitKey: abuseControlServiceMock.buildAuthRateLimitKey,
  buildCompositeAuthRateLimitKey: abuseControlServiceMock.buildCompositeAuthRateLimitKey,
  checkAuthAbuseControls: abuseControlServiceMock.checkAuthAbuseControls,
  clearAuthAbuseControls: abuseControlServiceMock.clearAuthAbuseControls,
  consumeAuthAbuseQuota: abuseControlServiceMock.consumeAuthAbuseQuota,
  registerAuthAbuseFailure: abuseControlServiceMock.registerAuthAbuseFailure,
}));

vi.mock("@/lib/env.server", () => ({
  isPreviewDeployment: envMock.isPreviewDeployment,
}));

vi.mock("@/lib/observability/logger", () => ({
  logServerWarning: loggerMock.logServerWarning,
}));

import {
  MIN_PASSWORD_LENGTH,
  MAX_USERNAME_LENGTH,
  MIN_USERNAME_LENGTH,
  signInWithEmailPassword,
  signUpWithEmailPassword,
  USERNAME_DISCRIMINATOR_LENGTH,
} from "@/lib/services/credential-auth-service";

const VALID_SIGN_UP_PASSWORD = "Password123!";

describe("credential-auth-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envMock.isPreviewDeployment.mockReturnValue(false);
    abuseControlServiceMock.checkAuthAbuseControls.mockResolvedValue({ ok: true });
    abuseControlServiceMock.consumeAuthAbuseQuota.mockResolvedValue({ ok: true });
    abuseControlServiceMock.registerAuthAbuseFailure.mockResolvedValue({ ok: true });
    abuseControlServiceMock.clearAuthAbuseControls.mockResolvedValue(undefined);
    sessionServiceMock.createSessionForUser.mockResolvedValue({
      sessionToken: "session-token",
      expiresAt: new Date("2026-03-01T00:00:00.000Z"),
    });
    cryptoMock.randomInt.mockReturnValue(1);
  });

  test("signUp rejects invalid email", async () => {
    const result = await signUpWithEmailPassword({
      usernameRaw: "test.user",
      emailRaw: "invalid-email",
      passwordRaw: VALID_SIGN_UP_PASSWORD,
      passwordConfirmationRaw: VALID_SIGN_UP_PASSWORD,
    });

    expect(result).toEqual({
      ok: false,
      error: "invalid-email",
    });
    expect(passwordServiceMock.hashPassword).not.toHaveBeenCalled();
  });

  test("signUp rejects invalid username", async () => {
    const result = await signUpWithEmailPassword({
      usernameRaw: "INVALID USER",
      emailRaw: "user@example.com",
      passwordRaw: VALID_SIGN_UP_PASSWORD,
      passwordConfirmationRaw: VALID_SIGN_UP_PASSWORD,
    });

    expect(result).toEqual({
      ok: false,
      error: "invalid-username",
    });
    expect(passwordServiceMock.hashPassword).not.toHaveBeenCalled();
  });

  test("signUp rejects short passwords", async () => {
    const result = await signUpWithEmailPassword({
      usernameRaw: "test.user",
      emailRaw: "user@example.com",
      passwordRaw: "x".repeat(MIN_PASSWORD_LENGTH - 1),
      passwordConfirmationRaw: "x".repeat(MIN_PASSWORD_LENGTH - 1),
    });

    expect(result).toEqual({
      ok: false,
      error: "password-too-short",
    });
    expect(passwordServiceMock.hashPassword).not.toHaveBeenCalled();
  });

  test("signUp rejects passwords longer than 128 characters", async () => {
    const result = await signUpWithEmailPassword({
      usernameRaw: "test.user",
      emailRaw: "user@example.com",
      passwordRaw: "x".repeat(129),
      passwordConfirmationRaw: "x".repeat(129),
    });

    expect(result).toEqual({
      ok: false,
      error: "password-too-long",
    });
    expect(passwordServiceMock.hashPassword).not.toHaveBeenCalled();
  });

  test("signUp rejects when password confirmation does not match", async () => {
    const result = await signUpWithEmailPassword({
      usernameRaw: "test.user",
      emailRaw: "user@example.com",
      passwordRaw: VALID_SIGN_UP_PASSWORD,
      passwordConfirmationRaw: "Password321!",
    });

    expect(result).toEqual({
      ok: false,
      error: "password-confirmation-mismatch",
    });
    expect(passwordServiceMock.hashPassword).not.toHaveBeenCalled();
  });

  test("signUp rejects passwords that do not satisfy complexity requirements", async () => {
    const result = await signUpWithEmailPassword({
      usernameRaw: "test.user",
      emailRaw: "user@example.com",
      passwordRaw: "password123",
      passwordConfirmationRaw: "password123",
    });

    expect(result).toEqual({
      ok: false,
      error: "password-requirements-not-met",
    });
    expect(passwordServiceMock.hashPassword).not.toHaveBeenCalled();
  });

  test("signUp returns email-in-use when unique constraint fails", async () => {
    passwordServiceMock.hashPassword.mockResolvedValueOnce("hash-1");
    prismaMock.user.create.mockRejectedValueOnce({ code: "P2002" });

    const result = await signUpWithEmailPassword({
      usernameRaw: "test.user",
      emailRaw: "user@example.com",
      passwordRaw: VALID_SIGN_UP_PASSWORD,
      passwordConfirmationRaw: VALID_SIGN_UP_PASSWORD,
    });

    expect(result).toEqual({
      ok: false,
      error: "email-in-use",
    });
  });

  test("signUp retries when username discriminator collides", async () => {
    passwordServiceMock.hashPassword.mockResolvedValue("hash-1");
    cryptoMock.randomInt.mockReturnValueOnce(1).mockReturnValueOnce(2);
    prismaMock.user.create
      .mockRejectedValueOnce({
        code: "P2002",
        meta: {
          target: ["username", "usernameDiscriminator"],
        },
      })
      .mockResolvedValueOnce({ id: "user-1" });

    const result = await signUpWithEmailPassword({
      usernameRaw: "test.user",
      emailRaw: "user@example.com",
      passwordRaw: VALID_SIGN_UP_PASSWORD,
      passwordConfirmationRaw: VALID_SIGN_UP_PASSWORD,
    });

    expect(prismaMock.user.create).toHaveBeenCalledTimes(2);
    expect(prismaMock.user.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          usernameDiscriminator: "0001",
        }),
      })
    );
    expect(prismaMock.user.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          usernameDiscriminator: "0002",
        }),
      })
    );
    expect(result).toEqual({
      ok: true,
      data: {
        userId: "user-1",
        emailVerified: false,
        sessionToken: "session-token",
        expiresAt: new Date("2026-03-01T00:00:00.000Z"),
      },
    });
  });

  test("signUp returns username-in-use when collision retry budget is exhausted", async () => {
    passwordServiceMock.hashPassword.mockResolvedValue("hash-1");
    prismaMock.user.create.mockRejectedValue({
      code: "P2002",
      meta: {
        target: ["username", "usernameDiscriminator"],
      },
    });

    const result = await signUpWithEmailPassword({
      usernameRaw: "test.user",
      emailRaw: "user@example.com",
      passwordRaw: VALID_SIGN_UP_PASSWORD,
      passwordConfirmationRaw: VALID_SIGN_UP_PASSWORD,
    });

    expect(prismaMock.user.create).toHaveBeenCalledTimes(12);
    expect(result).toEqual({
      ok: false,
      error: "username-in-use",
    });
  });

  test("signUp creates user, session, and normalizes email and username", async () => {
    passwordServiceMock.hashPassword.mockResolvedValueOnce("hash-1");
    prismaMock.user.create.mockResolvedValueOnce({
      id: "user-1",
      emailVerified: null,
    });

    const result = await signUpWithEmailPassword({
      usernameRaw: "  TEST.USER  ",
      emailRaw: "  USER@Example.com ",
      passwordRaw: VALID_SIGN_UP_PASSWORD,
      passwordConfirmationRaw: VALID_SIGN_UP_PASSWORD,
    });

    expect(prismaMock.user.create).toHaveBeenCalledWith({
      data: {
        email: "user@example.com",
        emailVerified: null,
        name: "test.user",
        username: "test.user",
        usernameDiscriminator: "0001",
        passwordHash: "hash-1",
      },
      select: {
        id: true,
        emailVerified: true,
      },
    });
    expect(cryptoMock.randomInt).toHaveBeenCalledWith(
      0,
      10 ** USERNAME_DISCRIMINATOR_LENGTH
    );
    expect(sessionServiceMock.createSessionForUser).toHaveBeenCalledWith("user-1");
    expect(result).toEqual({
      ok: true,
      data: {
        userId: "user-1",
        emailVerified: false,
        sessionToken: "session-token",
        expiresAt: new Date("2026-03-01T00:00:00.000Z"),
      },
    });
  });

  test("signUp auto-verifies preview-created email accounts", async () => {
    envMock.isPreviewDeployment.mockReturnValueOnce(true);
    passwordServiceMock.hashPassword.mockResolvedValueOnce("hash-1");
    prismaMock.user.create.mockResolvedValueOnce({
      id: "user-1",
      emailVerified: new Date("2026-03-21T00:00:00.000Z"),
    });

    const result = await signUpWithEmailPassword({
      usernameRaw: "preview.user",
      emailRaw: "preview@example.com",
      passwordRaw: VALID_SIGN_UP_PASSWORD,
      passwordConfirmationRaw: VALID_SIGN_UP_PASSWORD,
    });

    expect(prismaMock.user.create).toHaveBeenCalledWith({
      data: {
        email: "preview@example.com",
        emailVerified: expect.any(Date),
        name: "preview.user",
        username: "preview.user",
        usernameDiscriminator: "0001",
        passwordHash: "hash-1",
      },
      select: {
        id: true,
        emailVerified: true,
      },
    });
    expect(result).toEqual({
      ok: true,
      data: {
        userId: "user-1",
        emailVerified: true,
        sessionToken: "session-token",
        expiresAt: new Date("2026-03-01T00:00:00.000Z"),
      },
    });
  });

  test("signUp allows boundary username lengths", async () => {
    passwordServiceMock.hashPassword.mockResolvedValue("hash-1");
    prismaMock.user.create.mockResolvedValue({
      id: "user-1",
      emailVerified: null,
    });

    const shortResult = await signUpWithEmailPassword({
      usernameRaw: "a".repeat(MIN_USERNAME_LENGTH),
      emailRaw: "short@example.com",
      passwordRaw: VALID_SIGN_UP_PASSWORD,
      passwordConfirmationRaw: VALID_SIGN_UP_PASSWORD,
    });

    const longResult = await signUpWithEmailPassword({
      usernameRaw: "a".repeat(MAX_USERNAME_LENGTH),
      emailRaw: "long@example.com",
      passwordRaw: VALID_SIGN_UP_PASSWORD,
      passwordConfirmationRaw: VALID_SIGN_UP_PASSWORD,
    });

    expect(shortResult.ok).toBe(true);
    expect(longResult.ok).toBe(true);
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
        emailVerified: false,
        sessionToken: "session-token",
        expiresAt: new Date("2026-03-01T00:00:00.000Z"),
      },
    });
  });

  test("signIn still succeeds when abuse-control cleanup fails after valid credentials", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "user-1",
      passwordHash: "hash-1",
    });
    passwordServiceMock.verifyPassword.mockResolvedValueOnce(true);
    abuseControlServiceMock.clearAuthAbuseControls.mockRejectedValueOnce(
      new Error("cleanup-down")
    );

    const result = await signInWithEmailPassword({
      emailRaw: "user@example.com",
      passwordRaw: "password123",
      requestId: "request-1",
      ipAddress: "198.51.100.12",
      userAgent: "Vitest",
    });

    expect(result).toEqual({
      ok: true,
      data: {
        userId: "user-1",
        emailVerified: false,
        sessionToken: "session-token",
        expiresAt: new Date("2026-03-01T00:00:00.000Z"),
      },
    });
    expect(loggerMock.logServerWarning).toHaveBeenCalledWith(
      "credentialAuth.signInAbuseControlsClearFailed",
      expect.any(String),
      expect.objectContaining({
        requestId: "request-1",
        ipAddress: "198.51.100.12",
        userAgent: "Vitest",
        userId: "user-1",
      })
    );
  });

  test("signUp returns too-many-attempts when abuse controls are exceeded", async () => {
    abuseControlServiceMock.consumeAuthAbuseQuota.mockResolvedValueOnce({
      ok: false,
      retryAfterSeconds: 600,
    });

    const result = await signUpWithEmailPassword({
      usernameRaw: "test.user",
      emailRaw: "user@example.com",
      passwordRaw: VALID_SIGN_UP_PASSWORD,
      passwordConfirmationRaw: VALID_SIGN_UP_PASSWORD,
    });

    expect(result).toEqual({
      ok: false,
      error: "too-many-attempts",
    });
  });

  test("signIn returns too-many-attempts when preflight abuse controls are active", async () => {
    abuseControlServiceMock.checkAuthAbuseControls.mockResolvedValueOnce({
      ok: false,
      retryAfterSeconds: 600,
    });

    const result = await signInWithEmailPassword({
      emailRaw: "user@example.com",
      passwordRaw: "password123",
    });

    expect(result).toEqual({
      ok: false,
      error: "too-many-attempts",
    });
  });

  test("signIn escalates to too-many-attempts when a failed login trips the limiter", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null);
    abuseControlServiceMock.registerAuthAbuseFailure.mockResolvedValueOnce({
      ok: false,
      retryAfterSeconds: 600,
    });

    const result = await signInWithEmailPassword({
      emailRaw: "user@example.com",
      passwordRaw: "password123",
    });

    expect(result).toEqual({
      ok: false,
      error: "too-many-attempts",
    });
    expect(loggerMock.logServerWarning).toHaveBeenCalled();
  });
});
