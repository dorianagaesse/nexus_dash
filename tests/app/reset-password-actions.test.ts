import { beforeEach, describe, expect, test, vi } from "vitest";

const redirectMock = vi.hoisted(() => vi.fn());
const logServerErrorMock = vi.hoisted(() => vi.fn());
const logServerWarningMock = vi.hoisted(() => vi.fn());
const resetPasswordWithTokenMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/services/password-reset-service", () => ({
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
    expect(logServerWarningMock).toHaveBeenCalled();
  });

  test("keeps token in redirect for password validation failures", async () => {
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
      "NEXT_REDIRECT:/reset-password?error=password-confirmation-mismatch&token=raw-token"
    );
  });

  test("logs server exception and redirects with reset-failed", async () => {
    resetPasswordWithTokenMock.mockRejectedValueOnce(new Error("db-down"));

    const formData = new FormData();
    formData.set("token", "raw-token");
    formData.set("password", "StrongPass!1");
    formData.set("confirmPassword", "StrongPass!1");

    await expect(resetPasswordAction(formData)).rejects.toThrow(
      "NEXT_REDIRECT:/reset-password?error=reset-failed&token=raw-token"
    );
    expect(logServerErrorMock).toHaveBeenCalledWith(
      "resetPasswordAction",
      expect.any(Error)
    );
  });
});
