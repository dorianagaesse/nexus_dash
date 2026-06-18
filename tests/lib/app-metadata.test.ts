import { afterEach, describe, expect, test } from "vitest";

import { getAppMetadataSummary } from "@/lib/app-metadata";

describe("app-metadata", () => {
  const originalAppVersion = process.env.APP_VERSION;
  const originalPublicAppVersion = process.env.NEXT_PUBLIC_APP_VERSION;
  const originalVercelSha = process.env.VERCEL_GIT_COMMIT_SHA;
  const originalGithubSha = process.env.GITHUB_SHA;
  const originalCommitSha = process.env.COMMIT_SHA;
  const originalRepositoryUrl = process.env.APP_REPOSITORY_URL;
  const originalAppEnv = process.env.APP_ENV;
  const originalPublicAppEnv = process.env.NEXT_PUBLIC_APP_ENV;
  const originalVercelEnv = process.env.VERCEL_ENV;
  const originalNodeEnv = process.env.NODE_ENV;

  function restoreEnv(name: string, value: string | undefined): void {
    if (value === undefined) {
      delete process.env[name];
      return;
    }

    process.env[name] = value;
  }

  afterEach(() => {
    restoreEnv("APP_VERSION", originalAppVersion);
    restoreEnv("NEXT_PUBLIC_APP_VERSION", originalPublicAppVersion);
    restoreEnv("VERCEL_GIT_COMMIT_SHA", originalVercelSha);
    restoreEnv("GITHUB_SHA", originalGithubSha);
    restoreEnv("COMMIT_SHA", originalCommitSha);
    restoreEnv("APP_REPOSITORY_URL", originalRepositoryUrl);
    restoreEnv("APP_ENV", originalAppEnv);
    restoreEnv("NEXT_PUBLIC_APP_ENV", originalPublicAppEnv);
    restoreEnv("VERCEL_ENV", originalVercelEnv);
    restoreEnv("NODE_ENV", originalNodeEnv);
  });

  test("uses configured version and keeps revision out of the visible label", () => {
    process.env.APP_VERSION = "2.4.1";
    process.env.VERCEL_GIT_COMMIT_SHA = "abcd1234efgh5678";
    process.env.VERCEL_ENV = "preview";

    const summary = getAppMetadataSummary();

    expect(summary.versionTag).toBe("v2.4.1");
    expect(summary.revision).toBe("abcd123");
    expect(summary.revisionLabel).toBe("build abcd123");
    expect(summary.environment).toBe("preview");
    expect(summary.versionLabel).toBe("v2.4.1");
    expect(summary.diagnosticLabel).toBe("v2.4.1 | preview | build abcd123");
  });

  test("falls back to package.json version when no override exists", () => {
    delete process.env.APP_VERSION;
    delete process.env.NEXT_PUBLIC_APP_VERSION;
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    delete process.env.GITHUB_SHA;
    delete process.env.COMMIT_SHA;

    const summary = getAppMetadataSummary();

    expect(summary.versionTag).toBe("v0.19.1");
    expect(summary.revision).toBeNull();
    expect(summary.revisionLabel).toBeNull();
    expect(summary.versionLabel).toBe("v0.19.1");
  });

  test("strips build metadata from the visible version", () => {
    process.env.APP_VERSION = "v2.4.1+preview.5";
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    delete process.env.GITHUB_SHA;
    process.env.COMMIT_SHA = "1234567890";

    const summary = getAppMetadataSummary();

    expect(summary.versionTag).toBe("v2.4.1");
    expect(summary.versionLabel).toBe("v2.4.1");
    expect(summary.revision).toBe("1234567");
  });

  test("falls back to package version when configured version is invalid", () => {
    process.env.APP_VERSION = "release-candidate";

    const summary = getAppMetadataSummary();

    expect(summary.versionTag).toBe("v0.19.1");
    expect(summary.versionLabel).toBe("v0.19.1");
  });

  test("uses optional repository override when present", () => {
    process.env.APP_REPOSITORY_URL = "https://example.com/repo";

    const summary = getAppMetadataSummary();

    expect(summary.repositoryUrl).toBe("https://example.com/repo");
  });

  test("normalizes repository override when scheme is omitted", () => {
    process.env.APP_REPOSITORY_URL = "github.com/acme/workspace";

    const summary = getAppMetadataSummary();

    expect(summary.repositoryUrl).toBe("https://github.com/acme/workspace");
  });

  test("falls back to default repository url for unsupported schemes", () => {
    process.env.APP_REPOSITORY_URL = "javascript:alert('xss')";

    const summary = getAppMetadataSummary();

    expect(summary.repositoryUrl).toBe("https://github.com/dorianagaesse/nexus_dash");
  });

  test("normalizes runtime environment from explicit app env first", () => {
    process.env.APP_ENV = "production";
    process.env.VERCEL_ENV = "preview";

    const summary = getAppMetadataSummary();

    expect(summary.environment).toBe("production");
  });
});
