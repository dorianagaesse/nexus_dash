import { beforeEach, describe, expect, test, vi } from "vitest";

const headersMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() => vi.fn());
const logServerErrorMock = vi.hoisted(() => vi.fn());
const logServerWarningMock = vi.hoisted(() => vi.fn());
const requestPasswordResetForEmailMock = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({
  headers: headersMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/services/password-reset-service", () => ({
  requestPasswordResetForEmail: requestPasswordResetForEmailMock,
}));

vi.mock("@/lib/observability/logger", () => ({
  logServerError: logServerErrorMock,
  logServerWarning: logServerWarningMock,
}));

import { requestPasswordResetAction } from "@/app/forgot-password/actions";

describe("forgot-password actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    headersMock.mockReturnValue(
      new Headers([
        ["x-forwarded-proto", "https"],
        ["x-forwarded-host", "nexus-dash.app"],
      ])
    );
    requestPasswordResetForEmailMock.mockResolvedValue({
      ok: true,
      status: 202,
      data: {
        delivery: "sent",
      },
    });
    redirectMock.mockImplementation((path: string) => {
      throw new Error(`NEXT_REDIRECT:${path}`);
    });
  });

  test("always redirects with request-submitted status", async () => {
    const formData = new FormData();
    formData.set("email", "user@example.com");

    await expect(requestPasswordResetAction(formData)).rejects.toThrow(
      "NEXT_REDIRECT:/forgot-password?status=request-submitted"
    );
    expect(requestPasswordResetForEmailMock).toHaveBeenCalledWith({
      emailRaw: "user@example.com",
      requestOrigin: "https://nexus-dash.app",
    });
  });

  test("logs warning but preserves enumeration-safe redirect on service failure", async () => {
    requestPasswordResetForEmailMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      error: "password-reset-email-send-failed",
    });

    const formData = new FormData();
    formData.set("email", "user@example.com");

    await expect(requestPasswordResetAction(formData)).rejects.toThrow(
      "NEXT_REDIRECT:/forgot-password?status=request-submitted"
    );
    expect(logServerWarningMock).toHaveBeenCalled();
  });

  test("logs server error and still redirects with request-submitted status", async () => {
    requestPasswordResetForEmailMock.mockRejectedValueOnce(new Error("db-down"));

    const formData = new FormData();
    formData.set("email", "user@example.com");

    await expect(requestPasswordResetAction(formData)).rejects.toThrow(
      "NEXT_REDIRECT:/forgot-password?status=request-submitted"
    );
    expect(logServerErrorMock).toHaveBeenCalledWith(
      "requestPasswordResetAction",
      expect.any(Error)
    );
  });
});
