import { beforeEach, describe, expect, test, vi } from "vitest";

const headersMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() => vi.fn());
const logServerErrorMock = vi.hoisted(() => vi.fn());
const logServerWarningMock = vi.hoisted(() => vi.fn());
const requestPasswordResetForEmailMock = vi.hoisted(() => vi.fn());
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
  consumeAuthAbuseQuota: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: headersMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/services/password-reset-service", () => ({
  requestPasswordResetForEmail: requestPasswordResetForEmailMock,
}));

vi.mock("@/lib/services/auth-abuse-control-service", () => ({
  buildAuthRateLimitKey: abuseControlServiceMock.buildAuthRateLimitKey,
  buildCompositeAuthRateLimitKey: abuseControlServiceMock.buildCompositeAuthRateLimitKey,
  consumeAuthAbuseQuota: abuseControlServiceMock.consumeAuthAbuseQuota,
  AuthRateLimitScope: {
    password_reset: "password_reset",
  },
}));

vi.mock("@/lib/observability/logger", () => ({
  logServerError: logServerErrorMock,
  logServerWarning: logServerWarningMock,
}));

import { requestPasswordResetAction } from "@/app/forgot-password/actions";

describe("forgot-password actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    abuseControlServiceMock.consumeAuthAbuseQuota.mockResolvedValue({ ok: true });
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

  test("stays enumeration-safe when the abuse-control baseline throttles the request", async () => {
    abuseControlServiceMock.consumeAuthAbuseQuota.mockResolvedValueOnce({
      ok: false,
      retryAfterSeconds: 600,
    });

    const formData = new FormData();
    formData.set("email", "user@example.com");

    await expect(requestPasswordResetAction(formData)).rejects.toThrow(
      "NEXT_REDIRECT:/forgot-password?status=request-submitted"
    );
    expect(requestPasswordResetForEmailMock).not.toHaveBeenCalled();
    expect(logServerWarningMock).toHaveBeenCalled();
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
