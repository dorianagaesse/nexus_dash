import crypto from "node:crypto";

import { afterEach, describe, expect, test, vi } from "vitest";

import { getSupabaseRealtimeTokenRuntimeConfig } from "@/lib/env.server";
import { issueRealtimeToken } from "@/lib/services/realtime-token-service";

describe("Supabase Realtime token", () => {
  afterEach(() => vi.unstubAllEnvs());

  test("mints a short-lived, minimal signed JWT", () => {
    vi.stubEnv("SUPABASE_JWT_SECRET", "preview-signing-secret");
    vi.stubEnv("SUPABASE_REALTIME_TOKEN_TTL_SECONDS", "60");
    vi.stubEnv("SUPABASE_URL", "https://preview-ref.supabase.co");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_preview");

    const issued = issueRealtimeToken("user-1");
    const [header, payload, signature] = issued.token.split(".");
    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({
      alg: "HS256", typ: "JWT",
    });
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
    expect(Object.keys(claims).sort()).toEqual(["aud", "exp", "iat", "role", "sub"]);
    expect(claims).toMatchObject({
      sub: "user-1", role: "authenticated", aud: "authenticated",
    });
    expect(claims.exp - claims.iat).toBe(60);
    expect(signature).toBe(crypto.createHmac("sha256", "preview-signing-secret")
      .update(`${header}.${payload}`).digest("base64url"));
    expect(issued).toMatchObject({
      supabaseUrl: "https://preview-ref.supabase.co",
      supabasePublishableKey: "sb_publishable_preview",
    });
  });

  test("requires the secret and bounds the TTL at ten minutes", () => {
    vi.stubEnv("SUPABASE_JWT_SECRET", "");
    expect(() => getSupabaseRealtimeTokenRuntimeConfig()).toThrow("SUPABASE_JWT_SECRET");
    vi.stubEnv("SUPABASE_JWT_SECRET", "secret");
    vi.stubEnv("SUPABASE_REALTIME_TOKEN_TTL_SECONDS", "601");
    expect(() => getSupabaseRealtimeTokenRuntimeConfig()).toThrow("between 60 and 600");
    vi.stubEnv("SUPABASE_REALTIME_TOKEN_TTL_SECONDS", "600");
    expect(getSupabaseRealtimeTokenRuntimeConfig().ttlSeconds).toBe(600);
  });
});
