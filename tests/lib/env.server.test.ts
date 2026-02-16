import { afterEach, describe, expect, test, vi } from "vitest";

import {
  getDatabaseRuntimeConfig,
  getOptionalServerEnv,
  getRequiredServerEnv,
  getRuntimeEnvironment,
  getSupabaseClientRuntimeConfig,
  isProductionEnvironment,
} from "@/lib/env.server";

describe("env.server", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("reads required variables with trimming", () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "  client-id  ");

    expect(getRequiredServerEnv("GOOGLE_CLIENT_ID")).toBe("client-id");
  });

  test("throws when required variable is missing or empty", () => {
    vi.stubEnv("GOOGLE_CLIENT_SECRET", " ");

    expect(() => getRequiredServerEnv("GOOGLE_CLIENT_SECRET")).toThrow(
      "Missing required environment variable: GOOGLE_CLIENT_SECRET"
    );
    expect(() => getRequiredServerEnv("UNKNOWN_KEY")).toThrow(
      "Missing required environment variable: UNKNOWN_KEY"
    );
  });

  test("returns null for optional empty values", () => {
    vi.stubEnv("SUPABASE_URL", "");

    expect(getOptionalServerEnv("SUPABASE_URL")).toBeNull();
  });

  test("normalizes runtime environment with safe fallback", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(getRuntimeEnvironment()).toBe("production");
    expect(isProductionEnvironment()).toBe(true);

    vi.stubEnv("NODE_ENV", "test");
    expect(getRuntimeEnvironment()).toBe("test");
    expect(isProductionEnvironment()).toBe(false);

    vi.stubEnv("NODE_ENV", "staging");
    expect(getRuntimeEnvironment()).toBe("development");
  });

  test("builds database config and falls back direct url to database url", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://db-host:5432/postgres");
    vi.stubEnv("DIRECT_URL", "");

    expect(getDatabaseRuntimeConfig()).toEqual({
      databaseUrl: "postgresql://db-host:5432/postgres",
      directUrl: "postgresql://db-host:5432/postgres",
    });
  });

  test("returns null when supabase pair is fully unset", () => {
    expect(getSupabaseClientRuntimeConfig()).toBeNull();
  });

  test("throws when supabase pair is only partially configured", () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "");

    expect(() => getSupabaseClientRuntimeConfig()).toThrow(
      "SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be configured together."
    );
  });

  test("reads supabase pair when fully configured", () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "pk_test_123");

    expect(getSupabaseClientRuntimeConfig()).toEqual({
      url: "https://example.supabase.co",
      publishableKey: "pk_test_123",
    });
  });
});
