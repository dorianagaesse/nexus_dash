import { beforeEach, describe, expect, test, vi } from "vitest";

const authGuardMock = vi.hoisted(() => ({
  requireVerifiedSessionUserIdFromServer: vi.fn(),
}));

const accountProfileServiceMock = vi.hoisted(() => ({
  updateAccountEmail: vi.fn(),
  updateAccountPassword: vi.fn(),
  updateAccountUsername: vi.fn(),
}));

const emailVerificationServiceMock = vi.hoisted(() => ({
  issueEmailVerificationForUser: vi.fn(),
}));

const projectCollaborationServiceMock = vi.hoisted(() => ({
  respondToProjectInvitation: vi.fn(),
}));

const headersMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const resolveRequestOriginMock = vi.hoisted(() => vi.fn());
const logServerErrorMock = vi.hoisted(() => vi.fn());
const logServerWarningMock = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(),
  })),
  headers: headersMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/auth/server-guard", () => ({
  requireVerifiedSessionUserIdFromServer:
    authGuardMock.requireVerifiedSessionUserIdFromServer,
}));

vi.mock("@/lib/http/request-origin", () => ({
  resolveRequestOriginFromHeaders: resolveRequestOriginMock,
}));

vi.mock("@/lib/observability/logger", () => ({
  logServerError: logServerErrorMock,
  logServerWarning: logServerWarningMock,
}));

vi.mock("@/lib/services/account-profile-service", () => ({
  updateAccountEmail: accountProfileServiceMock.updateAccountEmail,
  updateAccountPassword: accountProfileServiceMock.updateAccountPassword,
  updateAccountUsername: accountProfileServiceMock.updateAccountUsername,
}));

vi.mock("@/lib/services/email-verification-service", () => ({
  issueEmailVerificationForUser: emailVerificationServiceMock.issueEmailVerificationForUser,
}));

vi.mock("@/lib/services/project-collaboration-service", () => ({
  respondToProjectInvitation:
    projectCollaborationServiceMock.respondToProjectInvitation,
}));

vi.mock("@/lib/services/session-service", () => ({
  readSessionTokenFromCookieReader: vi.fn(),
}));

import {
  acceptProjectInvitationAction,
  declineProjectInvitationAction,
  updateAccountEmailAction,
} from "@/app/account/actions";

describe("account actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authGuardMock.requireVerifiedSessionUserIdFromServer.mockResolvedValue("user-1");
    accountProfileServiceMock.updateAccountEmail.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        email: "updated@example.com",
        emailChanged: true,
      },
    });
    emailVerificationServiceMock.issueEmailVerificationForUser.mockResolvedValue({
      ok: true,
      status: 202,
      data: {
        expiresAt: new Date("2026-03-01T00:00:00.000Z"),
        delivery: "sent",
      },
    });
    projectCollaborationServiceMock.respondToProjectInvitation.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        projectId: "project-1",
      },
    });
    headersMock.mockReturnValue(new Headers());
    resolveRequestOriginMock.mockReturnValue("https://nexus-dash.app");
    redirectMock.mockImplementation((path: string) => {
      throw new Error(`NEXT_REDIRECT:${path}`);
    });
  });

  test("redirects with account error when email update validation fails", async () => {
    accountProfileServiceMock.updateAccountEmail.mockResolvedValueOnce({
      ok: false,
      status: 400,
      error: "invalid-email",
    });

    const formData = new FormData();
    formData.set("email", "invalid");

    await expect(updateAccountEmailAction(formData)).rejects.toThrow(
      "NEXT_REDIRECT:/account?error=invalid-email"
    );
    expect(emailVerificationServiceMock.issueEmailVerificationForUser).not.toHaveBeenCalled();
  });

  test("redirects to verify-email with sent status when email changes successfully", async () => {
    const formData = new FormData();
    formData.set("email", "updated@example.com");

    await expect(updateAccountEmailAction(formData)).rejects.toThrow(
      "NEXT_REDIRECT:/verify-email?status=verification-email-sent"
    );
    expect(emailVerificationServiceMock.issueEmailVerificationForUser).toHaveBeenCalledWith({
      actorUserId: "user-1",
      requestOrigin: "https://nexus-dash.app",
    });
    expect(logServerErrorMock).not.toHaveBeenCalled();
  });

  test("redirects to account with email-unchanged when nothing changed", async () => {
    accountProfileServiceMock.updateAccountEmail.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        email: "same@example.com",
        emailChanged: false,
      },
    });

    const formData = new FormData();
    formData.set("email", "same@example.com");

    await expect(updateAccountEmailAction(formData)).rejects.toThrow(
      "NEXT_REDIRECT:/account?status=email-unchanged"
    );
    expect(emailVerificationServiceMock.issueEmailVerificationForUser).not.toHaveBeenCalled();
  });

  test("maps verification issuance failures to verify-email error redirects", async () => {
    emailVerificationServiceMock.issueEmailVerificationForUser.mockResolvedValueOnce({
      ok: false,
      status: 429,
      error: "resend-limit-reached",
    });

    const formData = new FormData();
    formData.set("email", "updated@example.com");

    await expect(updateAccountEmailAction(formData)).rejects.toThrow(
      "NEXT_REDIRECT:/verify-email?error=resend-limit-reached"
    );
    expect(logServerWarningMock).toHaveBeenCalled();
  });

  test("accepts invitation and redirects with success status", async () => {
    const formData = new FormData();
    formData.set("invitationId", "invite-1");

    await expect(acceptProjectInvitationAction(formData)).rejects.toThrow(
      "NEXT_REDIRECT:/account?status=invitation-accepted"
    );

    expect(projectCollaborationServiceMock.respondToProjectInvitation).toHaveBeenCalledWith({
      actorUserId: "user-1",
      invitationId: "invite-1",
      decision: "accept",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/account");
    expect(revalidatePathMock).toHaveBeenCalledWith("/account/settings");
    expect(revalidatePathMock).toHaveBeenCalledWith("/projects");
    expect(revalidatePathMock).toHaveBeenCalledWith("/projects/project-1");
  });

  test("declines invitation and redirects with success status", async () => {
    const formData = new FormData();
    formData.set("invitationId", "invite-2");

    await expect(declineProjectInvitationAction(formData)).rejects.toThrow(
      "NEXT_REDIRECT:/account?status=invitation-declined"
    );

    expect(projectCollaborationServiceMock.respondToProjectInvitation).toHaveBeenCalledWith({
      actorUserId: "user-1",
      invitationId: "invite-2",
      decision: "decline",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/account");
    expect(revalidatePathMock).toHaveBeenCalledWith("/account/settings");
    expect(revalidatePathMock).toHaveBeenCalledWith("/projects");
  });
});
