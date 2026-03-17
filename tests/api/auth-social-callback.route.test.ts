import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const socialAuthRouteMock = vi.hoisted(() => ({
  isSocialAuthProvider: vi.fn(),
  normalizeHomeAuthForm: vi.fn(),
  normalizeReturnToPath: vi.fn(),
  resolveSocialOAuthRedirectUri: vi.fn(),
  SOCIAL_OAUTH_STATE_COOKIE: "nexusdash_social_oauth_state",
  SOCIAL_OAUTH_PROVIDER_COOKIE: "nexusdash_social_oauth_provider",
  SOCIAL_OAUTH_RETURN_TO_COOKIE: "nexusdash_social_oauth_return_to",
  SOCIAL_OAUTH_FORM_COOKIE: "nexusdash_social_oauth_form",
}));

const authServiceMock = vi.hoisted(() => ({
  authenticateWithSocialProvider: vi.fn(),
}));

vi.mock("@/lib/social-auth", () => ({
  isSocialAuthProvider: socialAuthRouteMock.isSocialAuthProvider,
  normalizeHomeAuthForm: socialAuthRouteMock.normalizeHomeAuthForm,
  normalizeReturnToPath: socialAuthRouteMock.normalizeReturnToPath,
  resolveSocialOAuthRedirectUri: socialAuthRouteMock.resolveSocialOAuthRedirectUri,
  SOCIAL_OAUTH_STATE_COOKIE: socialAuthRouteMock.SOCIAL_OAUTH_STATE_COOKIE,
  SOCIAL_OAUTH_PROVIDER_COOKIE: socialAuthRouteMock.SOCIAL_OAUTH_PROVIDER_COOKIE,
  SOCIAL_OAUTH_RETURN_TO_COOKIE: socialAuthRouteMock.SOCIAL_OAUTH_RETURN_TO_COOKIE,
  SOCIAL_OAUTH_FORM_COOKIE: socialAuthRouteMock.SOCIAL_OAUTH_FORM_COOKIE,
}));

vi.mock("@/lib/services/social-auth-service", () => ({
  authenticateWithSocialProvider: authServiceMock.authenticateWithSocialProvider,
}));

import { GET } from "@/app/api/auth/callback/[provider]/route";

function createRequest(url: string, cookies: Record<string, string>): NextRequest {
  const cookieHeader = Object.entries(cookies)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("; ");

  return new NextRequest(url, {
    headers: cookieHeader.length > 0 ? { cookie: cookieHeader } : undefined,
  });
}

describe("GET /api/auth/callback/[provider]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    socialAuthRouteMock.isSocialAuthProvider.mockReturnValue(true);
    socialAuthRouteMock.normalizeHomeAuthForm.mockImplementation(
      (value: string | null) => (value === "signup" ? "signup" : "signin")
    );
    socialAuthRouteMock.normalizeReturnToPath.mockImplementation(
      (value: string | null) => (value && value.startsWith("/") ? value : "/projects")
    );
    socialAuthRouteMock.resolveSocialOAuthRedirectUri.mockReturnValue(
      "http://localhost/api/auth/callback/google"
    );
  });

  test("sets session cookie and redirects to return target on success", async () => {
    authServiceMock.authenticateWithSocialProvider.mockResolvedValueOnce({
      ok: true,
      data: {
        userId: "user-1",
        emailVerified: true,
        sessionToken: "session-token",
        expiresAt: new Date("2026-03-20T00:00:00.000Z"),
        isNewUser: false,
        provider: "google",
      },
    });

    const response = await GET(
      createRequest(
        "http://localhost/api/auth/callback/google?state=expected&code=oauth-code",
        {
          nexusdash_social_oauth_state: "expected",
          nexusdash_social_oauth_provider: "google",
          nexusdash_social_oauth_return_to: "/projects",
          nexusdash_social_oauth_form: "signin",
        }
      ),
      { params: { provider: "google" } }
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/projects");
    expect(response.headers.get("set-cookie")).toContain(
      "nexusdash.session-token=session-token"
    );
  });

  test("redirects home with mapped error when social auth service fails", async () => {
    authServiceMock.authenticateWithSocialProvider.mockResolvedValueOnce({
      ok: false,
      error: "social-email-unverified",
    });

    const response = await GET(
      createRequest(
        "http://localhost/api/auth/callback/github?state=expected&code=oauth-code",
        {
          nexusdash_social_oauth_state: "expected",
          nexusdash_social_oauth_provider: "github",
          nexusdash_social_oauth_return_to: "/projects",
          nexusdash_social_oauth_form: "signup",
        }
      ),
      { params: { provider: "github" } }
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/?form=signup&error=social-email-unverified"
    );
  });
});
