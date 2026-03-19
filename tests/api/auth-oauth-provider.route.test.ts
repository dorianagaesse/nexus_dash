import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const sessionUserMock = vi.hoisted(() => ({
  getSessionUserIdFromRequest: vi.fn(),
}));

const socialAuthMock = vi.hoisted(() => ({
  isSocialAuthProvider: vi.fn(),
  normalizeHomeAuthForm: vi.fn(),
  normalizeReturnToPath: vi.fn(),
  resolveSocialOAuthRedirectUri: vi.fn(),
  buildSocialOAuthAuthorizationUrl: vi.fn(),
  SOCIAL_OAUTH_STATE_COOKIE: "nexusdash_social_oauth_state",
  SOCIAL_OAUTH_PROVIDER_COOKIE: "nexusdash_social_oauth_provider",
  SOCIAL_OAUTH_RETURN_TO_COOKIE: "nexusdash_social_oauth_return_to",
  SOCIAL_OAUTH_FORM_COOKIE: "nexusdash_social_oauth_form",
}));

vi.mock("@/lib/auth/session-user", () => ({
  getSessionUserIdFromRequest: sessionUserMock.getSessionUserIdFromRequest,
}));

vi.mock("@/lib/social-auth", () => ({
  isSocialAuthProvider: socialAuthMock.isSocialAuthProvider,
  normalizeHomeAuthForm: socialAuthMock.normalizeHomeAuthForm,
  normalizeReturnToPath: socialAuthMock.normalizeReturnToPath,
  resolveSocialOAuthRedirectUri: socialAuthMock.resolveSocialOAuthRedirectUri,
  buildSocialOAuthAuthorizationUrl: socialAuthMock.buildSocialOAuthAuthorizationUrl,
  SOCIAL_OAUTH_STATE_COOKIE: socialAuthMock.SOCIAL_OAUTH_STATE_COOKIE,
  SOCIAL_OAUTH_PROVIDER_COOKIE: socialAuthMock.SOCIAL_OAUTH_PROVIDER_COOKIE,
  SOCIAL_OAUTH_RETURN_TO_COOKIE: socialAuthMock.SOCIAL_OAUTH_RETURN_TO_COOKIE,
  SOCIAL_OAUTH_FORM_COOKIE: socialAuthMock.SOCIAL_OAUTH_FORM_COOKIE,
}));

import { GET } from "@/app/api/auth/oauth/[provider]/route";

describe("GET /api/auth/oauth/[provider]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionUserMock.getSessionUserIdFromRequest.mockResolvedValue(null);
    socialAuthMock.isSocialAuthProvider.mockReturnValue(true);
    socialAuthMock.normalizeHomeAuthForm.mockReturnValue("signin");
    socialAuthMock.normalizeReturnToPath.mockReturnValue("/projects");
    socialAuthMock.resolveSocialOAuthRedirectUri.mockReturnValue(
      "http://localhost/api/auth/oauth/google/callback"
    );
    socialAuthMock.buildSocialOAuthAuthorizationUrl.mockReturnValue(
      "https://accounts.example.com/oauth"
    );
  });

  test("redirects to provider oauth url and stores provider cookies", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost/api/auth/oauth/google?form=signin&returnTo=/projects"
      ),
      { params: { provider: "google" } }
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://accounts.example.com/oauth"
    );
    expect(response.headers.get("set-cookie")).toContain(
      "nexusdash_social_oauth_state="
    );
    expect(response.headers.get("set-cookie")).toContain(
      "nexusdash_social_oauth_provider=google"
    );
  });

  test("redirects signed-in users directly to return target", async () => {
    sessionUserMock.getSessionUserIdFromRequest.mockResolvedValueOnce("user-1");

    const response = await GET(
      new NextRequest(
        "http://localhost/api/auth/oauth/google?form=signin&returnTo=/projects"
      ),
      { params: { provider: "google" } }
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/projects");
  });

  test("redirects home with disabled error when provider config is unavailable", async () => {
    socialAuthMock.buildSocialOAuthAuthorizationUrl.mockImplementationOnce(() => {
      throw new Error("social-provider-disabled");
    });

    const response = await GET(
      new NextRequest("http://localhost/api/auth/oauth/google?form=signup"),
      { params: { provider: "google" } }
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/?form=signin&error=social-provider-disabled"
    );
  });
});
