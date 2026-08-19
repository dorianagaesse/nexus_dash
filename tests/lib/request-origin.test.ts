import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { resolveRequestOriginFromHeaders } from "@/lib/http/request-origin";

class TestHeaders {
  constructor(private readonly values: Record<string, string | undefined>) {}

  get(name: string): string | null {
    const value = this.values[name.toLowerCase()];
    return typeof value === "string" ? value : null;
  }
}

function restoreEnvironmentVariable(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}

describe("request-origin", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalVercelEnv = process.env.VERCEL_ENV;
  const originalVercelUrl = process.env.VERCEL_URL;
  const originalNextAuthUrl = process.env.NEXTAUTH_URL;
  const originalTrustedOrigins = process.env.TRUSTED_ORIGINS;

  beforeEach(() => {
    process.env.NODE_ENV = "test";
    delete process.env.VERCEL_ENV;
    delete process.env.VERCEL_URL;
    delete process.env.NEXTAUTH_URL;
    delete process.env.TRUSTED_ORIGINS;
  });

  afterEach(() => {
    restoreEnvironmentVariable("NODE_ENV", originalNodeEnv);
    restoreEnvironmentVariable("VERCEL_ENV", originalVercelEnv);
    restoreEnvironmentVariable("VERCEL_URL", originalVercelUrl);
    restoreEnvironmentVariable("NEXTAUTH_URL", originalNextAuthUrl);
    restoreEnvironmentVariable("TRUSTED_ORIGINS", originalTrustedOrigins);
  });

  test("uses forwarded origin when available", () => {
    const origin = resolveRequestOriginFromHeaders(
      new TestHeaders({
        "x-forwarded-proto": "https",
        "x-forwarded-host": "preview.nexus-dash.app",
      })
    );

    expect(origin).toBe("https://preview.nexus-dash.app");
  });

  test("falls back to host header when forwarded values are invalid", () => {
    const origin = resolveRequestOriginFromHeaders(
      new TestHeaders({
        "x-forwarded-proto": "javascript",
        "x-forwarded-host": "attacker.example.com",
        host: "localhost:3000",
      })
    );

    expect(origin).toBe("http://localhost:3000");
  });

  test("uses trusted production origin when forwarded host is not allowlisted", () => {
    process.env.NODE_ENV = "production";
    process.env.NEXTAUTH_URL = "https://nexus-dash.app";

    const origin = resolveRequestOriginFromHeaders(
      new TestHeaders({
        "x-forwarded-proto": "https",
        "x-forwarded-host": "evil.example.com",
      })
    );

    expect(origin).toBe("https://nexus-dash.app");
  });

  test("uses the immutable deployment origin in Vercel preview", () => {
    process.env.NODE_ENV = "production";
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_URL =
      "nexus-dash-immutable-dorian-agaesses-projects.vercel.app";
    process.env.NEXTAUTH_URL = "https://nexus-dash.app";

    const origin = resolveRequestOriginFromHeaders(
      new TestHeaders({
        "x-forwarded-proto": "https",
        "x-forwarded-host":
          "nexus-dash-immutable-dorian-agaesses-projects.vercel.app",
      })
    );

    expect(origin).toBe(
      "https://nexus-dash-immutable-dorian-agaesses-projects.vercel.app"
    );
  });

  test("falls back to the immutable deployment origin for a stale preview alias", () => {
    process.env.NODE_ENV = "production";
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_URL =
      "nexus-dash-immutable-dorian-agaesses-projects.vercel.app";
    process.env.NEXTAUTH_URL =
      "https://nexus-dash-stale-dorian-agaesses-projects.vercel.app";

    const origin = resolveRequestOriginFromHeaders(
      new TestHeaders({
        "x-forwarded-proto": "https",
        "x-forwarded-host":
          "nexus-dash-stale-dorian-agaesses-projects.vercel.app",
      })
    );

    expect(origin).toBe(
      "https://nexus-dash-immutable-dorian-agaesses-projects.vercel.app"
    );
  });

  test("fails closed when Vercel preview has no immutable deployment URL", () => {
    process.env.NODE_ENV = "production";
    process.env.VERCEL_ENV = "preview";
    delete process.env.VERCEL_URL;

    expect(() =>
      resolveRequestOriginFromHeaders(
        new TestHeaders({
          "x-forwarded-proto": "https",
          "x-forwarded-host": "preview.example.com",
        })
      )
    ).toThrow(
      "Unable to resolve trusted request origin in Vercel preview. Configure VERCEL_URL."
    );
  });

  test("throws in production when no trusted origin is configured", () => {
    process.env.NODE_ENV = "production";
    delete process.env.NEXTAUTH_URL;
    delete process.env.TRUSTED_ORIGINS;

    expect(() =>
      resolveRequestOriginFromHeaders(
        new TestHeaders({
          "x-forwarded-proto": "https",
          "x-forwarded-host": "nexus-dash.app",
        })
      )
    ).toThrow(
      "Unable to resolve trusted request origin in production. Configure TRUSTED_ORIGINS or NEXTAUTH_URL."
    );
  });
});
