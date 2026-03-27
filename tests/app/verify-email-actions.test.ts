import { beforeEach, describe, expect, test, vi } from "vitest";

const sessionUserMock = vi.hoisted(() => ({
  getSessionUserIdFromServer: vi.fn(),
}));

const emailVerificationMock = vi.hoisted(() => ({
  getEmailVerificationStatus: vi.fn(),
  issueEmailVerificationForUser: vi.fn(),
}));

const headersMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() => vi.fn());
const logServerErrorMock = vi.hoisted(() => vi.fn());
const logServerWarningMock = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({
  headers: headersMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/auth/session-user", () => ({
  getSessionUserIdFromServer: sessionUserMock.getSessionUserIdFromServer,
}));

vi.mock("@/lib/services/email-verification-service", () => ({
  getEmailVerificationStatus: emailVerificationMock.getEmailVerificationStatus,
  issueEmailVerificationForUser: emailVerificationMock.issueEmailVerificationForUser,
}));

vi.mock("@/lib/observability/logger", () => ({
  logServerError: logServerErrorMock,
  logServerWarning: logServerWarningMock,
}));

import {
  continueAfterVerificationAction,
  resendVerificationEmailAction,
} from "@/app/verify-email/actions";

describe("verify-email actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionUserMock.getSessionUserIdFromServer.mockResolvedValue("user-1");
    emailVerificationMock.issueEmailVerificationForUser.mockResolvedValue({
      ok: true,
      status: 202,
      data: {
        expiresAt: new Date("2026-03-01T00:00:00.000Z"),
        delivery: "sent",
      },
    });
    emailVerificationMock.getEmailVerificationStatus.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        isVerified: false,
        email: "user@example.com",
      },
    });
    headersMock.mockReturnValue(
      new Headers([
        ["x-forwarded-proto", "https"],
        ["x-forwarded-host", "nexus-dash.app"],
      ])
    );
    redirectMock.mockImplementation((path: string) => {
      throw new Error(`NEXT_REDIRECT:${path}`);
    });
  });

  test("resendVerificationEmailAction redirects to resend-sent without server error log", async () => {
    await expect(resendVerificationEmailAction()).rejects.toThrow(
      "NEXT_REDIRECT:/verify-email?status=resend-sent"
    );

    expect(logServerErrorMock).not.toHaveBeenCalled();
    expect(emailVerificationMock.issueEmailVerificationForUser).toHaveBeenCalledWith({
      actorUserId: "user-1",
      requestOrigin: "https://nexus-dash.app",
      returnToPath: "/projects",
    });
  });

  test("resendVerificationEmailAction redirects verified users to projects", async () => {
    emailVerificationMock.issueEmailVerificationForUser.mockResolvedValueOnce({
      ok: false,
      status: 409,
      error: "already-verified",
    });

    await expect(resendVerificationEmailAction()).rejects.toThrow(
      "NEXT_REDIRECT:/projects"
    );
  });

  test("resendVerificationEmailAction logs exception and redirects with error", async () => {
    emailVerificationMock.issueEmailVerificationForUser.mockRejectedValueOnce(
      new Error("db-down")
    );

    await expect(resendVerificationEmailAction()).rejects.toThrow(
      "NEXT_REDIRECT:/verify-email?error=verification-email-send-failed"
    );
    expect(logServerErrorMock).toHaveBeenCalledWith(
      "resendVerificationEmailAction",
      expect.any(Error)
    );
  });

  test("continueAfterVerificationAction redirects to projects for verified users", async () => {
    emailVerificationMock.getEmailVerificationStatus.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        isVerified: true,
        email: "user@example.com",
      },
    });

    await expect(continueAfterVerificationAction()).rejects.toThrow(
      "NEXT_REDIRECT:/projects"
    );

    expect(logServerErrorMock).not.toHaveBeenCalled();
  });
});
