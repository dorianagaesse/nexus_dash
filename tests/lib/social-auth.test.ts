import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  normalizeReturnToPath,
  resolveSocialOAuthRedirectUri,
} from "@/lib/social-auth";

describe("social-auth", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  test("keeps safe in-app return paths", () => {
    expect(normalizeReturnToPath("/projects?tab=active#auth")).toBe(
      "/projects?tab=active#auth"
    );
  });

  test("falls back for protocol-relative and malformed paths", () => {
    expect(normalizeReturnToPath("//evil.com")).toBe("/projects");
    expect(normalizeReturnToPath("/\\evil")).toBe("/projects");
    expect(normalizeReturnToPath("/projects\u0000")).toBe("/projects");
  });

  test("preserves the registered GitHub callback path when deriving a redirect", () => {
    vi.stubEnv("AUTH_GITHUB_CLIENT_ID", "github-client-id");
    vi.stubEnv("AUTH_GITHUB_CLIENT_SECRET", "github-client-secret");

    expect(
      resolveSocialOAuthRedirectUri("github", "https://preview.example.com")
    ).toBe("https://preview.example.com/api/auth/callback/github");
  });

  test("keeps social Google callbacks separate from Calendar OAuth", () => {
    vi.stubEnv("AUTH_GOOGLE_CLIENT_ID", "google-client-id");
    vi.stubEnv("AUTH_GOOGLE_CLIENT_SECRET", "google-client-secret");

    expect(
      resolveSocialOAuthRedirectUri("google", "https://preview.example.com")
    ).toBe("https://preview.example.com/api/auth/oauth/google/callback");
  });
});
