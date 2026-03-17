import { beforeEach, describe, expect, test, vi } from "vitest";

const prismaMock = vi.hoisted(() => {
  const tx = {
    user: {
      create: vi.fn(),
      update: vi.fn(),
    },
    account: {
      create: vi.fn(),
    },
  };

  return {
    tx,
    prisma: {
      account: {
        findUnique: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx)
      ),
    },
  };
});

const sessionServiceMock = vi.hoisted(() => ({
  createSessionForUser: vi.fn(),
}));

const socialAuthMock = vi.hoisted(() => ({
  exchangeSocialAuthorizationCodeForTokens: vi.fn(),
  fetchSocialUserProfile: vi.fn(),
}));

const cryptoMock = vi.hoisted(() => ({
  randomInt: vi.fn(),
}));

vi.mock("node:crypto", () => ({
  randomInt: cryptoMock.randomInt,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock.prisma,
}));

vi.mock("@/lib/services/session-service", () => ({
  createSessionForUser: sessionServiceMock.createSessionForUser,
}));

vi.mock("@/lib/social-auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/social-auth")>(
    "@/lib/social-auth"
  );

  return {
    ...actual,
    exchangeSocialAuthorizationCodeForTokens:
      socialAuthMock.exchangeSocialAuthorizationCodeForTokens,
    fetchSocialUserProfile: socialAuthMock.fetchSocialUserProfile,
  };
});

import { authenticateWithSocialProvider } from "@/lib/services/social-auth-service";

describe("social-auth-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cryptoMock.randomInt.mockReturnValue(1);
    sessionServiceMock.createSessionForUser.mockResolvedValue({
      sessionToken: "session-token",
      expiresAt: new Date("2026-03-20T00:00:00.000Z"),
    });
    socialAuthMock.exchangeSocialAuthorizationCodeForTokens.mockResolvedValue({
      accessToken: "access-token",
      expiresIn: 3600,
    });
  });

  test("creates a new user and linked social account for verified profile email", async () => {
    socialAuthMock.fetchSocialUserProfile.mockResolvedValueOnce({
      provider: "google",
      providerAccountId: "google-123",
      email: "Jane.Doe@example.com",
      emailVerified: true,
      name: "Jane Doe",
      image: "https://example.com/avatar.png",
      usernameCandidate: "Jane-Doe",
    });
    prismaMock.prisma.account.findUnique.mockResolvedValue(null);
    prismaMock.prisma.user.findUnique.mockResolvedValue(null);
    prismaMock.tx.user.create.mockResolvedValueOnce({
      id: "user-1",
      emailVerified: new Date("2026-03-20T00:00:00.000Z"),
    });

    const result = await authenticateWithSocialProvider({
      provider: "google",
      code: "oauth-code",
      redirectUri: "https://app.example.com/api/auth/callback/google",
    });

    expect(result).toEqual({
      ok: true,
      data: {
        userId: "user-1",
        emailVerified: true,
        sessionToken: "session-token",
        expiresAt: new Date("2026-03-20T00:00:00.000Z"),
        isNewUser: true,
        provider: "google",
      },
    });
    expect(prismaMock.tx.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: "jane.doe@example.com",
        name: "Jane Doe",
        image: "https://example.com/avatar.png",
        passwordHash: null,
        username: "jane.doe",
        usernameDiscriminator: "0001",
        accounts: {
          create: {
            type: "oauth",
            provider: "google",
            providerAccountId: "google-123",
          },
        },
      }),
      select: {
        id: true,
        emailVerified: true,
      },
    });
  });

  test("links verified provider identity to an existing email user", async () => {
    socialAuthMock.fetchSocialUserProfile.mockResolvedValueOnce({
      provider: "github",
      providerAccountId: "github-456",
      email: "user@example.com",
      emailVerified: true,
      name: "GitHub Name",
      image: "https://example.com/github.png",
      usernameCandidate: "octocat",
    });
    prismaMock.prisma.account.findUnique.mockResolvedValue(null);
    prismaMock.prisma.user.findUnique.mockResolvedValueOnce({
      id: "user-2",
      emailVerified: null,
      name: null,
      image: null,
    });
    prismaMock.tx.account.create.mockResolvedValueOnce({});
    prismaMock.tx.user.update.mockResolvedValueOnce({
      id: "user-2",
      emailVerified: new Date("2026-03-20T00:00:00.000Z"),
    });

    const result = await authenticateWithSocialProvider({
      provider: "github",
      code: "oauth-code",
      redirectUri: "https://app.example.com/api/auth/callback/github",
    });

    expect(result.ok).toBe(true);
    expect(prismaMock.tx.account.create).toHaveBeenCalledWith({
      data: {
        userId: "user-2",
        type: "oauth",
        provider: "github",
        providerAccountId: "github-456",
      },
    });
    expect(prismaMock.tx.user.update).toHaveBeenCalledWith({
      where: { id: "user-2" },
      data: {
        name: "GitHub Name",
        image: "https://example.com/github.png",
        emailVerified: expect.any(Date),
      },
      select: {
        id: true,
        emailVerified: true,
      },
    });
  });

  test("signs in through an existing linked provider account even when profile email is absent", async () => {
    socialAuthMock.fetchSocialUserProfile.mockResolvedValueOnce({
      provider: "github",
      providerAccountId: "github-789",
      email: null,
      emailVerified: false,
      name: "Octo",
      image: null,
      usernameCandidate: "octo",
    });
    prismaMock.prisma.account.findUnique.mockResolvedValueOnce({
      userId: "user-3",
      user: {
        emailVerified: new Date("2026-03-20T00:00:00.000Z"),
        name: "Existing User",
        image: null,
      },
    });

    const result = await authenticateWithSocialProvider({
      provider: "github",
      code: "oauth-code",
      redirectUri: "https://app.example.com/api/auth/callback/github",
    });

    expect(result).toEqual({
      ok: true,
      data: {
        userId: "user-3",
        emailVerified: true,
        sessionToken: "session-token",
        expiresAt: new Date("2026-03-20T00:00:00.000Z"),
        isNewUser: false,
        provider: "github",
      },
    });
  });

  test("rejects creating a new account when provider email is missing", async () => {
    socialAuthMock.fetchSocialUserProfile.mockResolvedValueOnce({
      provider: "github",
      providerAccountId: "github-111",
      email: null,
      emailVerified: false,
      name: "Octo",
      image: null,
      usernameCandidate: "octo",
    });
    prismaMock.prisma.account.findUnique.mockResolvedValueOnce(null);

    const result = await authenticateWithSocialProvider({
      provider: "github",
      code: "oauth-code",
      redirectUri: "https://app.example.com/api/auth/callback/github",
    });

    expect(result).toEqual({
      ok: false,
      error: "social-email-unavailable",
    });
  });
});
