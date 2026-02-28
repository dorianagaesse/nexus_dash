import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { resolveRequestOriginFromHeaders } from "@/lib/http/request-origin";

class TestHeaders {
  constructor(private readonly values: Record<string, string | undefined>) {}

  get(name: string): string | null {
    const value = this.values[name.toLowerCase()];
    return typeof value === "string" ? value : null;
  }
}

describe("request-origin", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalNextAuthUrl = process.env.NEXTAUTH_URL;
  const originalTrustedOrigins = process.env.TRUSTED_ORIGINS;

  beforeEach(() => {
    process.env.NODE_ENV = "test";
    delete process.env.NEXTAUTH_URL;
    delete process.env.TRUSTED_ORIGINS;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.NEXTAUTH_URL = originalNextAuthUrl;
    process.env.TRUSTED_ORIGINS = originalTrustedOrigins;
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
