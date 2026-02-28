import { beforeEach, describe, expect, test, vi } from "vitest";

const cookieStoreMock = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
}));

const redirectMock = vi.hoisted(() => vi.fn());
const logServerErrorMock = vi.hoisted(() => vi.fn());
const logServerWarningMock = vi.hoisted(() => vi.fn());
const resetPasswordWithTokenMock = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({
  cookies: () => cookieStoreMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/services/password-reset-service", () => ({
  PASSWORD_RESET_RETRY_COOKIE_NAME: "nexusdash.reset-token",
  PASSWORD_RESET_RETRY_COOKIE_TTL_SECONDS: 600,
  resetPasswordWithToken: resetPasswordWithTokenMock,
}));

vi.mock("@/lib/observability/logger", () => ({
  logServerError: logServerErrorMock,
  logServerWarning: logServerWarningMock,
}));

import { resetPasswordAction } from "@/app/reset-password/actions";

describe("reset-password actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookieStoreMock.get.mockReturnValue(undefined);
    resetPasswordWithTokenMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        userId: "user-1",
        sessionsRevoked: true,
      },
    });
    redirectMock.mockImplementation((path: string) => {
      throw new Error(`NEXT_REDIRECT:${path}`);
    });
  });

  test("redirects to sign-in success status on successful reset", async () => {
    const formData = new FormData();
    formData.set("token", "raw-token");
    formData.set("password", "StrongPass!1");
    formData.set("confirmPassword", "StrongPass!1");

    await expect(resetPasswordAction(formData)).rejects.toThrow(
      "NEXT_REDIRECT:/?form=signin&status=password-reset-success"
    );
    expect(resetPasswordWithTokenMock).toHaveBeenCalledWith({
      rawToken: "raw-token",
      newPasswordRaw: "StrongPass!1",
      newPasswordConfirmationRaw: "StrongPass!1",
    });
  });

  test("maps invalid token failures to invalid-reset-link", async () => {
    resetPasswordWithTokenMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      error: "invalid-token",
    });

    const formData = new FormData();
    formData.set("token", "raw-token");
    formData.set("password", "StrongPass!1");
    formData.set("confirmPassword", "StrongPass!1");

    await expect(resetPasswordAction(formData)).rejects.toThrow(
      "NEXT_REDIRECT:/reset-password?error=invalid-reset-link"
    );
    expect(cookieStoreMock.set).toHaveBeenCalledWith(
      "nexusdash.reset-token",
      "",
      expect.objectContaining({
        maxAge: 0,
        path: "/reset-password",
      })
    );
    expect(logServerWarningMock).toHaveBeenCalled();
  });

  test("stores token in secure retry cookie for password validation failures", async () => {
    resetPasswordWithTokenMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      error: "password-confirmation-mismatch",
    });

    const formData = new FormData();
    formData.set("token", "raw-token");
    formData.set("password", "StrongPass!1");
    formData.set("confirmPassword", "StrongPass!2");

    await expect(resetPasswordAction(formData)).rejects.toThrow(
      "NEXT_REDIRECT:/reset-password?error=password-confirmation-mismatch"
    );
    expect(cookieStoreMock.set).toHaveBeenCalledWith(
      "nexusdash.reset-token",
      "raw-token",
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        path: "/reset-password",
      })
    );
  });

  test("logs server exception and redirects with reset-failed", async () => {
    resetPasswordWithTokenMock.mockRejectedValueOnce(new Error("db-down"));

    const formData = new FormData();
    formData.set("token", "raw-token");
    formData.set("password", "StrongPass!1");
    formData.set("confirmPassword", "StrongPass!1");

    await expect(resetPasswordAction(formData)).rejects.toThrow(
      "NEXT_REDIRECT:/reset-password?error=reset-failed"
    );
    expect(logServerErrorMock).toHaveBeenCalledWith(
      "resetPasswordAction",
      expect.any(Error)
    );
  });

  test("reads token from retry cookie when form token is missing", async () => {
    cookieStoreMock.get.mockReturnValue({
      name: "nexusdash.reset-token",
      value: "cookie-token",
    });

    const formData = new FormData();
    formData.set("password", "StrongPass!1");
    formData.set("confirmPassword", "StrongPass!1");

    await expect(resetPasswordAction(formData)).rejects.toThrow(
      "NEXT_REDIRECT:/?form=signin&status=password-reset-success"
    );
    expect(resetPasswordWithTokenMock).toHaveBeenCalledWith({
      rawToken: "cookie-token",
      newPasswordRaw: "StrongPass!1",
      newPasswordConfirmationRaw: "StrongPass!1",
    });
  });
});
