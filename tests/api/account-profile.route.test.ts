import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const apiGuardMock = vi.hoisted(() => ({
  requireAuthenticatedApiUser: vi.fn(),
}));

const profileServiceMock = vi.hoisted(() => ({
  getAccountProfile: vi.fn(),
  regenerateAccountAvatar: vi.fn(),
  updateAccountEmail: vi.fn(),
  updateAccountPassword: vi.fn(),
  updateAccountUsername: vi.fn(),
}));

const emailVerificationServiceMock = vi.hoisted(() => ({
  issueEmailVerificationForUser: vi.fn(),
}));

const sessionServiceMock = vi.hoisted(() => ({
  readSessionTokenFromCookieReader: vi.fn(),
}));

const logServerWarningMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/api-guard", () => ({
  requireAuthenticatedApiUser: apiGuardMock.requireAuthenticatedApiUser,
}));

vi.mock("@/lib/observability/logger", () => ({
  logServerWarning: logServerWarningMock,
}));

vi.mock("@/lib/services/account-profile-service", () => ({
  getAccountProfile: profileServiceMock.getAccountProfile,
  regenerateAccountAvatar: profileServiceMock.regenerateAccountAvatar,
  updateAccountEmail: profileServiceMock.updateAccountEmail,
  updateAccountPassword: profileServiceMock.updateAccountPassword,
  updateAccountUsername: profileServiceMock.updateAccountUsername,
}));

vi.mock("@/lib/services/email-verification-service", () => ({
  issueEmailVerificationForUser:
    emailVerificationServiceMock.issueEmailVerificationForUser,
}));

vi.mock("@/lib/services/session-service", () => ({
  readSessionTokenFromCookieReader:
    sessionServiceMock.readSessionTokenFromCookieReader,
}));

import { POST as regenerateAvatar } from "@/app/api/account/profile/avatar/route";
import {
  GET as getProfile,
  PATCH as updateProfile,
} from "@/app/api/account/profile/route";
import { PATCH as updatePassword } from "@/app/api/account/password/route";

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("account profile routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiGuardMock.requireAuthenticatedApiUser.mockResolvedValue({
      ok: true,
      userId: "user-1",
    });
    sessionServiceMock.readSessionTokenFromCookieReader.mockReturnValue(
      "session-token"
    );
  });

  test("GET returns auth failure response when unauthenticated", async () => {
    apiGuardMock.requireAuthenticatedApiUser.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    });

    const response = await getProfile(
      new NextRequest("http://localhost/api/account/profile")
    );

    expect(response.status).toBe(401);
    await expect(readJson(response)).resolves.toEqual({ error: "unauthorized" });
    expect(profileServiceMock.getAccountProfile).not.toHaveBeenCalled();
  });

  test("GET returns the account profile", async () => {
    profileServiceMock.getAccountProfile.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        email: "user@example.com",
        isEmailVerified: true,
        username: "user",
        usernameDiscriminator: "1234",
        usernameTag: "user#1234",
        avatarSeed: "seed",
      },
    });

    const response = await getProfile(
      new NextRequest("http://localhost/api/account/profile")
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({
      profile: {
        email: "user@example.com",
        isEmailVerified: true,
        username: "user",
        usernameDiscriminator: "1234",
        usernameTag: "user#1234",
        avatarSeed: "seed",
      },
    });
    expect(profileServiceMock.getAccountProfile).toHaveBeenCalledWith("user-1");
  });

  test("PATCH updates username and changed email, issuing verification", async () => {
    profileServiceMock.updateAccountUsername.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        username: "newuser",
        usernameDiscriminator: "5678",
        usernameTag: "newuser#5678",
        discriminatorRegenerated: false,
      },
    });
    profileServiceMock.updateAccountEmail.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        email: "new@example.com",
        emailChanged: true,
      },
    });
    emailVerificationServiceMock.issueEmailVerificationForUser.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        expiresAt: "2026-05-08T08:00:00.000Z",
      },
    });

    const response = await updateProfile(
      new NextRequest("http://localhost/api/account/profile", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          origin: "https://app.example.com",
        },
        body: JSON.stringify({
          username: " newuser ",
          email: " NEW@EXAMPLE.COM ",
        }),
      })
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({
      username: {
        username: "newuser",
        usernameDiscriminator: "5678",
        usernameTag: "newuser#5678",
        discriminatorRegenerated: false,
      },
      email: {
        email: "new@example.com",
        emailChanged: true,
      },
      emailVerification: {
        expiresAt: "2026-05-08T08:00:00.000Z",
      },
    });
    expect(profileServiceMock.updateAccountUsername).toHaveBeenCalledWith({
      actorUserId: "user-1",
      usernameRaw: " newuser ",
    });
    expect(profileServiceMock.updateAccountEmail).toHaveBeenCalledWith({
      actorUserId: "user-1",
      emailRaw: " NEW@EXAMPLE.COM ",
    });
    expect(
      emailVerificationServiceMock.issueEmailVerificationForUser
    ).toHaveBeenCalledWith({
      actorUserId: "user-1",
      requestOrigin: "http://localhost:3000",
    });
  });

  test("PATCH rejects invalid json payloads", async () => {
    const response = await updateProfile(
      new NextRequest("http://localhost/api/account/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: "{",
      })
    );

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({ error: "invalid-json" });
    expect(logServerWarningMock).toHaveBeenCalled();
    expect(profileServiceMock.updateAccountUsername).not.toHaveBeenCalled();
    expect(profileServiceMock.updateAccountEmail).not.toHaveBeenCalled();
  });

  test("POST avatar regeneration returns the new avatar seed", async () => {
    profileServiceMock.regenerateAccountAvatar.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { avatarSeed: "new-seed" },
    });

    const response = await regenerateAvatar(
      new NextRequest("http://localhost/api/account/profile/avatar", {
        method: "POST",
      })
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({
      avatar: { avatarSeed: "new-seed" },
    });
    expect(profileServiceMock.regenerateAccountAvatar).toHaveBeenCalledWith({
      actorUserId: "user-1",
    });
  });

  test("PATCH password forwards password fields and current session token", async () => {
    profileServiceMock.updateAccountPassword.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { sessionsRevoked: true },
    });

    const response = await updatePassword(
      new NextRequest("http://localhost/api/account/password", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: "nexusdash.session=session-token",
        },
        body: JSON.stringify({
          currentPassword: "old-password",
          newPassword: "new-password-123",
          confirmNewPassword: "new-password-123",
        }),
      })
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({
      password: { sessionsRevoked: true },
    });
    expect(sessionServiceMock.readSessionTokenFromCookieReader).toHaveBeenCalled();
    expect(profileServiceMock.updateAccountPassword).toHaveBeenCalledWith({
      actorUserId: "user-1",
      currentPasswordRaw: "old-password",
      newPasswordRaw: "new-password-123",
      newPasswordConfirmationRaw: "new-password-123",
      currentSessionToken: "session-token",
    });
  });
});
