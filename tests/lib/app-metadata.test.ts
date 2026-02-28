import { afterEach, describe, expect, test } from "vitest";

import { getAppMetadataSummary } from "@/lib/app-metadata";

describe("app-metadata", () => {
  const originalAppVersion = process.env.APP_VERSION;
  const originalPublicAppVersion = process.env.NEXT_PUBLIC_APP_VERSION;
  const originalVercelSha = process.env.VERCEL_GIT_COMMIT_SHA;
  const originalGithubSha = process.env.GITHUB_SHA;
  const originalCommitSha = process.env.COMMIT_SHA;
  const originalRepositoryUrl = process.env.APP_REPOSITORY_URL;

  afterEach(() => {
    process.env.APP_VERSION = originalAppVersion;
    process.env.NEXT_PUBLIC_APP_VERSION = originalPublicAppVersion;
    process.env.VERCEL_GIT_COMMIT_SHA = originalVercelSha;
    process.env.GITHUB_SHA = originalGithubSha;
    process.env.COMMIT_SHA = originalCommitSha;
    process.env.APP_REPOSITORY_URL = originalRepositoryUrl;
  });

  test("uses configured version and commit sha when provided", () => {
    process.env.APP_VERSION = "2.4.1";
    process.env.VERCEL_GIT_COMMIT_SHA = "abcd1234efgh5678";

    const summary = getAppMetadataSummary();

    expect(summary.versionTag).toBe("v2.4.1");
    expect(summary.revision).toBe("abcd123");
    expect(summary.versionLabel).toBe("v2.4.1+abcd123");
  });

  test("falls back to package.json version when no override exists", () => {
    delete process.env.APP_VERSION;
    delete process.env.NEXT_PUBLIC_APP_VERSION;
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    delete process.env.GITHUB_SHA;
    delete process.env.COMMIT_SHA;

    const summary = getAppMetadataSummary();

    expect(summary.versionTag).toBe("v0.1.0");
    expect(summary.revision).toBeNull();
    expect(summary.versionLabel).toBe("v0.1.0");
  });

  test("uses optional repository override when present", () => {
    process.env.APP_REPOSITORY_URL = "https://example.com/repo";

    const summary = getAppMetadataSummary();

    expect(summary.repositoryUrl).toBe("https://example.com/repo");
  });
});
