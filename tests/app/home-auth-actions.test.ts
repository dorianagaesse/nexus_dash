import { beforeEach, describe, expect, test, vi } from "vitest";

const sessionUserMock = vi.hoisted(() => ({
  getSessionUserIdFromServer: vi.fn(),
}));

const credentialAuthMock = vi.hoisted(() => ({
  signInWithEmailPassword: vi.fn(),
  signUpWithEmailPassword: vi.fn(),
}));

const cookieStoreMock = vi.hoisted(() => ({
  set: vi.fn(),
}));

const redirectMock = vi.hoisted(() => vi.fn());
const logServerErrorMock = vi.hoisted(() => vi.fn());
const isProductionEnvironmentMock = vi.hoisted(() => vi.fn(() => false));

vi.mock("next/headers", () => ({
  cookies: () => cookieStoreMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/auth/session-user", () => ({
  getSessionUserIdFromServer: sessionUserMock.getSessionUserIdFromServer,
}));

vi.mock("@/lib/services/credential-auth-service", () => ({
  signInWithEmailPassword: credentialAuthMock.signInWithEmailPassword,
  signUpWithEmailPassword: credentialAuthMock.signUpWithEmailPassword,
}));

vi.mock("@/lib/observability/logger", () => ({
  logServerError: logServerErrorMock,
}));

vi.mock("@/lib/env.server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/env.server")>(
    "@/lib/env.server"
  );

  return {
    ...actual,
    isProductionEnvironment: isProductionEnvironmentMock,
  };
});

import { signInAction, signUpAction } from "@/app/home-auth-actions";

describe("home auth actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionUserMock.getSessionUserIdFromServer.mockResolvedValue(null);
    redirectMock.mockImplementation((path: string) => {
      throw new Error(`NEXT_REDIRECT:${path}`);
    });
  });

  test("signInAction redirects to home with form error when credentials are invalid", async () => {
    credentialAuthMock.signInWithEmailPassword.mockResolvedValueOnce({
      ok: false,
      error: "invalid-credentials",
    });

    const formData = new FormData();
    formData.set("email", "user@example.com");
    formData.set("password", "password123");

    await expect(signInAction(formData)).rejects.toThrow(
      "NEXT_REDIRECT:/?form=signin&error=invalid-credentials"
    );

    expect(cookieStoreMock.set).not.toHaveBeenCalled();
  });

  test("signInAction redirects authenticated users directly to projects", async () => {
    sessionUserMock.getSessionUserIdFromServer.mockResolvedValueOnce("user-1");

    const formData = new FormData();
    formData.set("email", "user@example.com");
    formData.set("password", "password123");

    await expect(signInAction(formData)).rejects.toThrow("NEXT_REDIRECT:/projects");
    expect(credentialAuthMock.signInWithEmailPassword).not.toHaveBeenCalled();
  });

  test("signInAction redirects with auth-unavailable on service exception", async () => {
    credentialAuthMock.signInWithEmailPassword.mockRejectedValueOnce(
      new Error("db-down")
    );

    const formData = new FormData();
    formData.set("email", "user@example.com");
    formData.set("password", "password123");

    await expect(signInAction(formData)).rejects.toThrow(
      "NEXT_REDIRECT:/?form=signin&error=auth-unavailable"
    );

    expect(logServerErrorMock).toHaveBeenCalledWith(
      "signInAction",
      expect.any(Error)
    );
  });

  test("signInAction sets session cookie and redirects to projects on success", async () => {
    credentialAuthMock.signInWithEmailPassword.mockResolvedValueOnce({
      ok: true,
      data: {
        userId: "user-1",
        sessionToken: "session-token",
        expiresAt: new Date("2026-03-01T00:00:00.000Z"),
      },
    });

    const formData = new FormData();
    formData.set("email", "user@example.com");
    formData.set("password", "password123");

    await expect(signInAction(formData)).rejects.toThrow("NEXT_REDIRECT:/projects");

    expect(cookieStoreMock.set).toHaveBeenCalledWith(
      "nexusdash.session-token",
      "session-token",
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        secure: false,
        path: "/",
      })
    );
  });

  test("signUpAction redirects authenticated users directly to projects", async () => {
    sessionUserMock.getSessionUserIdFromServer.mockResolvedValueOnce("user-1");

    const formData = new FormData();
    formData.set("username", "test.user");
    formData.set("email", "user@example.com");
    formData.set("password", "password123");
    formData.set("confirmPassword", "password123");

    await expect(signUpAction(formData)).rejects.toThrow("NEXT_REDIRECT:/projects");
    expect(credentialAuthMock.signUpWithEmailPassword).not.toHaveBeenCalled();
  });

  test("signUpAction sets session cookie and redirects to projects on success", async () => {
    credentialAuthMock.signUpWithEmailPassword.mockResolvedValueOnce({
      ok: true,
      data: {
        userId: "user-1",
        sessionToken: "session-token",
        expiresAt: new Date("2026-03-01T00:00:00.000Z"),
      },
    });

    const formData = new FormData();
    formData.set("username", "test.user");
    formData.set("email", "user@example.com");
    formData.set("password", "password123");
    formData.set("confirmPassword", "password123");

    await expect(signUpAction(formData)).rejects.toThrow("NEXT_REDIRECT:/projects");

    expect(credentialAuthMock.signUpWithEmailPassword).toHaveBeenCalledWith({
      usernameRaw: "test.user",
      emailRaw: "user@example.com",
      passwordRaw: "password123",
      passwordConfirmationRaw: "password123",
    });

    expect(cookieStoreMock.set).toHaveBeenCalledWith(
      "nexusdash.session-token",
      "session-token",
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        secure: false,
        path: "/",
      })
    );
  });

  test("signUpAction redirects with email-in-use error code", async () => {
    credentialAuthMock.signUpWithEmailPassword.mockResolvedValueOnce({
      ok: false,
      error: "email-in-use",
    });

    const formData = new FormData();
    formData.set("username", "test.user");
    formData.set("email", "user@example.com");
    formData.set("password", "password123");
    formData.set("confirmPassword", "password123");

    await expect(signUpAction(formData)).rejects.toThrow(
      "NEXT_REDIRECT:/?form=signup&error=email-in-use"
    );
  });

  test("signUpAction redirects with invalid-email error code", async () => {
    credentialAuthMock.signUpWithEmailPassword.mockResolvedValueOnce({
      ok: false,
      error: "invalid-email",
    });

    const formData = new FormData();
    formData.set("username", "test.user");
    formData.set("email", "user@example.com");
    formData.set("password", "password123");
    formData.set("confirmPassword", "password123");

    await expect(signUpAction(formData)).rejects.toThrow(
      "NEXT_REDIRECT:/?form=signup&error=invalid-email"
    );
  });

  test("signUpAction redirects with password-confirmation-mismatch error code", async () => {
    credentialAuthMock.signUpWithEmailPassword.mockResolvedValueOnce({
      ok: false,
      error: "password-confirmation-mismatch",
    });

    const formData = new FormData();
    formData.set("username", "test.user");
    formData.set("email", "user@example.com");
    formData.set("password", "password123");
    formData.set("confirmPassword", "password321");

    await expect(signUpAction(formData)).rejects.toThrow(
      "NEXT_REDIRECT:/?form=signup&error=password-confirmation-mismatch"
    );
  });

  test("signUpAction redirects with auth-unavailable on service exception", async () => {
    credentialAuthMock.signUpWithEmailPassword.mockRejectedValueOnce(
      new Error("db-down")
    );

    const formData = new FormData();
    formData.set("username", "test.user");
    formData.set("email", "user@example.com");
    formData.set("password", "password123");
    formData.set("confirmPassword", "password123");

    await expect(signUpAction(formData)).rejects.toThrow(
      "NEXT_REDIRECT:/?form=signup&error=auth-unavailable"
    );

    expect(logServerErrorMock).toHaveBeenCalledWith(
      "signUpAction",
      expect.any(Error)
    );
  });
});
