import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  getDatabaseRuntimeConfig,
  getOptionalServerEnv,
  getRequiredServerEnv,
  getRuntimeEnvironment,
  getStorageRuntimeConfig,
  getSupabaseClientRuntimeConfig,
  getVercelEnvironment,
  isLiveProductionDeployment,
  isProductionEnvironment,
  validateServerRuntimeConfig,
} from "@/lib/env.server";

const ENV_KEYS_TO_RESET = [
  "NODE_ENV",
  "VERCEL_ENV",
  "DATABASE_URL",
  "DIRECT_URL",
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_API_KEY",
  "NEXTAUTH_URL",
  "NEXTAUTH_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "STORAGE_PROVIDER",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "R2_SIGNED_URL_TTL_SECONDS",
];

describe("env.server", () => {
  beforeEach(() => {
    for (const key of ENV_KEYS_TO_RESET) {
      vi.stubEnv(key, "");
    }
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
  });

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
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("SUPABASE_API_KEY", "");

    expect(getOptionalServerEnv("SUPABASE_URL")).toBeNull();
  });

  test("returns null for optional undefined values", () => {
    expect(getOptionalServerEnv("UNKNOWN_OPTIONAL_ENV_KEY")).toBeNull();
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

  test("resolves Vercel environment and live production deployment mode", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(getVercelEnvironment()).toBe("preview");
    expect(isLiveProductionDeployment()).toBe(false);

    vi.stubEnv("VERCEL_ENV", "production");
    expect(getVercelEnvironment()).toBe("production");
    expect(isLiveProductionDeployment()).toBe(true);

    vi.stubEnv("VERCEL_ENV", "");
    expect(getVercelEnvironment()).toBeNull();
    expect(isLiveProductionDeployment()).toBe(true);

    vi.stubEnv("NODE_ENV", "development");
    expect(isLiveProductionDeployment()).toBe(false);
  });

  test("builds database config and falls back direct url to database url", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://db-host:5432/postgres");
    vi.stubEnv("DIRECT_URL", "");

    expect(getDatabaseRuntimeConfig()).toEqual({
      databaseUrl: "postgresql://db-host:5432/postgres",
      directUrl: "postgresql://db-host:5432/postgres",
    });
  });

  test("requires direct url in production runtime", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://db-host:5432/postgres");
    vi.stubEnv("DIRECT_URL", "");

    expect(() =>
      getDatabaseRuntimeConfig({ runtimeEnvironment: "production" })
    ).toThrow(
      "Missing required environment variable: DIRECT_URL (required in production)"
    );
  });

  test("builds database config without fallback when direct url is set", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://primary-host:5432/appdb");
    vi.stubEnv("DIRECT_URL", "postgresql://read-replica-host:5432/appdb");

    expect(getDatabaseRuntimeConfig()).toEqual({
      databaseUrl: "postgresql://primary-host:5432/appdb",
      directUrl: "postgresql://read-replica-host:5432/appdb",
    });
  });

  test("returns null when supabase pair is fully empty/unset", () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("SUPABASE_API_KEY", "");

    expect(getSupabaseClientRuntimeConfig()).toBeNull();
  });

  test("throws when supabase pair is only partially configured", () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("SUPABASE_API_KEY", "");

    expect(() => getSupabaseClientRuntimeConfig()).toThrow(
      "SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (or legacy SUPABASE_API_KEY) must be configured together."
    );
  });

  test("throws when supabase pair is partially configured with missing url", () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "pk_test_123");
    vi.stubEnv("SUPABASE_API_KEY", "");

    expect(() => getSupabaseClientRuntimeConfig()).toThrow(
      "SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (or legacy SUPABASE_API_KEY) must be configured together."
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

  test("uses legacy supabase api key when modern publishable key is unset", () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("SUPABASE_API_KEY", "legacy_pk_test_456");

    expect(getSupabaseClientRuntimeConfig()).toEqual({
      url: "https://example.supabase.co",
      publishableKey: "legacy_pk_test_456",
    });
  });

  test("validates server runtime config with minimal required env", () => {
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://runtime-user:pwd@runtime-db.example.com:5432/postgres?sslmode=require"
    );
    vi.stubEnv(
      "DIRECT_URL",
      "postgresql://admin-user:pwd@direct-db.example.com:5432/postgres?sslmode=require"
    );
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("STORAGE_PROVIDER", "local");
    vi.stubEnv("NODE_ENV", "production");

    expect(() => validateServerRuntimeConfig()).not.toThrow();
  });

  test("returns local storage runtime config by default", () => {
    vi.stubEnv("STORAGE_PROVIDER", "");

    expect(getStorageRuntimeConfig()).toEqual({
      provider: "local",
      r2: null,
    });
  });

  test("returns r2 storage runtime config when fully configured", () => {
    vi.stubEnv("STORAGE_PROVIDER", "r2");
    vi.stubEnv("R2_ACCOUNT_ID", "acc");
    vi.stubEnv("R2_ACCESS_KEY_ID", "key");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "secret");
    vi.stubEnv("R2_BUCKET_NAME", "bucket");
    vi.stubEnv("R2_SIGNED_URL_TTL_SECONDS", "900");

    expect(getStorageRuntimeConfig()).toEqual({
      provider: "r2",
      r2: {
        accountId: "acc",
        accessKeyId: "key",
        secretAccessKey: "secret",
        bucketName: "bucket",
        signedUrlTtlSeconds: 900,
      },
    });
  });

  test("fails when storage provider is invalid", () => {
    vi.stubEnv("STORAGE_PROVIDER", "unknown");

    expect(() => getStorageRuntimeConfig()).toThrow(
      "STORAGE_PROVIDER must be one of: local, r2."
    );
  });

  test("fails when r2 provider is selected with missing credentials", () => {
    vi.stubEnv("STORAGE_PROVIDER", "r2");
    vi.stubEnv("R2_ACCOUNT_ID", "acc");
    vi.stubEnv("R2_ACCESS_KEY_ID", "");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "secret");
    vi.stubEnv("R2_BUCKET_NAME", "bucket");

    expect(() => getStorageRuntimeConfig()).toThrow(
      "Missing required environment variable: R2_ACCESS_KEY_ID"
    );
  });

  test("fails runtime validation when database url is not postgres", () => {
    vi.stubEnv("DATABASE_URL", "mysql://db-host:3306/app");
    vi.stubEnv("DIRECT_URL", "postgresql://direct-host:5432/postgres");

    expect(() => validateServerRuntimeConfig()).toThrow(
      "DATABASE_URL must use a PostgreSQL connection string."
    );
  });

  test("fails runtime validation when nextauth pair is partially configured", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://db-host:5432/postgres");
    vi.stubEnv("DIRECT_URL", "postgresql://direct-host:5432/postgres");
    vi.stubEnv("NEXTAUTH_URL", "https://app.example.com");
    vi.stubEnv("NEXTAUTH_SECRET", "");

    expect(() => validateServerRuntimeConfig()).toThrow(
      "NEXTAUTH_URL and NEXTAUTH_SECRET must be configured together."
    );
  });

  test("fails runtime validation when google oauth triplet is partially configured", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://db-host:5432/postgres");
    vi.stubEnv("DIRECT_URL", "postgresql://direct-host:5432/postgres");
    vi.stubEnv("GOOGLE_CLIENT_ID", "client-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    vi.stubEnv("GOOGLE_REDIRECT_URI", "https://app.example.com/callback");

    expect(() => validateServerRuntimeConfig()).toThrow(
      "GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI must be configured together."
    );
  });

  test("fails runtime validation when google redirect uri is invalid", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://db-host:5432/postgres");
    vi.stubEnv("DIRECT_URL", "postgresql://direct-host:5432/postgres");
    vi.stubEnv("GOOGLE_CLIENT_ID", "client-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "client-secret");
    vi.stubEnv("GOOGLE_REDIRECT_URI", "/relative-callback");

    expect(() => validateServerRuntimeConfig()).toThrow(
      "GOOGLE_REDIRECT_URI must be a valid absolute URL."
    );
  });

  test("fails runtime validation when production google oauth is enabled without token encryption key", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgresql://localhost:5432/postgres");
    vi.stubEnv("DIRECT_URL", "postgresql://localhost:5433/postgres");
    vi.stubEnv("GOOGLE_CLIENT_ID", "client-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "client-secret");
    vi.stubEnv("GOOGLE_REDIRECT_URI", "https://app.example.com/callback");
    vi.stubEnv("GOOGLE_TOKEN_ENCRYPTION_KEY", "");

    expect(() => validateServerRuntimeConfig()).toThrow(
      "GOOGLE_TOKEN_ENCRYPTION_KEY is required in production when Google Calendar OAuth is enabled."
    );
  });

  test("passes runtime validation when production google oauth includes token encryption key", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgresql://localhost:5432/postgres");
    vi.stubEnv("DIRECT_URL", "postgresql://localhost:5433/postgres");
    vi.stubEnv("GOOGLE_CLIENT_ID", "client-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "client-secret");
    vi.stubEnv("GOOGLE_REDIRECT_URI", "https://app.example.com/callback");
    vi.stubEnv("GOOGLE_TOKEN_ENCRYPTION_KEY", "dev-test-key");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");

    expect(() => validateServerRuntimeConfig()).not.toThrow();
  });

  test("fails runtime validation when production resend key is missing", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgresql://localhost:5432/postgres");
    vi.stubEnv("DIRECT_URL", "postgresql://localhost:5433/postgres");
    vi.stubEnv("RESEND_API_KEY", "");

    expect(() => validateServerRuntimeConfig()).toThrow(
      "RESEND_API_KEY is required in production for email verification delivery."
    );
  });

  test("passes runtime validation in Vercel preview when resend key is missing", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("DATABASE_URL", "postgresql://localhost:5432/postgres");
    vi.stubEnv("DIRECT_URL", "postgresql://localhost:5433/postgres");
    vi.stubEnv("RESEND_API_KEY", "");

    expect(() => validateServerRuntimeConfig()).not.toThrow();
  });

  test("fails runtime validation when resend from email is malformed", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://db-host:5432/postgres");
    vi.stubEnv("DIRECT_URL", "postgresql://direct-host:5432/postgres");
    vi.stubEnv("RESEND_FROM_EMAIL", "invalid-email");

    expect(() => validateServerRuntimeConfig()).toThrow(
      "RESEND_FROM_EMAIL must look like a valid email identity."
    );
  });

  test("fails runtime validation when supabase url is not absolute", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://db-host:5432/postgres");
    vi.stubEnv("DIRECT_URL", "postgresql://direct-host:5432/postgres");
    vi.stubEnv("SUPABASE_URL", "/relative");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "pk_test");

    expect(() => validateServerRuntimeConfig()).toThrow(
      "SUPABASE_URL must be a valid absolute URL."
    );
  });

  test("fails runtime validation when r2 env group is partially configured", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://db-host:5432/postgres");
    vi.stubEnv("DIRECT_URL", "postgresql://direct-host:5432/postgres");
    vi.stubEnv("R2_ACCOUNT_ID", "acc");
    vi.stubEnv("R2_ACCESS_KEY_ID", "");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "");
    vi.stubEnv("R2_BUCKET_NAME", "");

    expect(() => validateServerRuntimeConfig()).toThrow(
      "R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME must be configured together."
    );
  });

  test("fails runtime validation when r2 signed url ttl is invalid", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://db-host:5432/postgres");
    vi.stubEnv("DIRECT_URL", "postgresql://direct-host:5432/postgres");
    vi.stubEnv("R2_SIGNED_URL_TTL_SECONDS", "0");

    expect(() => validateServerRuntimeConfig()).toThrow(
      "R2_SIGNED_URL_TTL_SECONDS must be a positive integer."
    );
  });

  test("fails runtime validation when production remote urls are equal", () => {
    const sameUrl =
      "postgresql://user:pwd@pooler.supabase.com:5432/postgres?sslmode=require";
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", sameUrl);
    vi.stubEnv("DIRECT_URL", sameUrl);

    expect(() => validateServerRuntimeConfig()).toThrow(
      "DATABASE_URL and DIRECT_URL must differ in production when using remote database hosts."
    );
  });

  test("fails runtime validation when production remote urls target the same endpoint", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://runtime-user:pwd@db.shared-host.com:5432/postgres?sslmode=require"
    );
    vi.stubEnv(
      "DIRECT_URL",
      "postgresql://admin-user:pwd@db.shared-host.com:5432/postgres?sslmode=require"
    );

    expect(() => validateServerRuntimeConfig()).toThrow(
      "DATABASE_URL and DIRECT_URL must target different endpoints in production (pooled runtime vs direct admin/migration)."
    );
  });

  test("fails runtime validation when production remote database url has no tls", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://runtime-user:pwd@pooler.supabase.com:5432/postgres"
    );
    vi.stubEnv(
      "DIRECT_URL",
      "postgresql://admin-user:pwd@db.project-ref.supabase.co:5432/postgres?sslmode=require"
    );

    expect(() => validateServerRuntimeConfig()).toThrow(
      "DATABASE_URL must enforce TLS for remote production hosts (for example ?sslmode=require)."
    );
  });

  test("fails runtime validation when production remote direct url has no tls", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://runtime-user:pwd@pooler.supabase.com:5432/postgres?sslmode=require"
    );
    vi.stubEnv(
      "DIRECT_URL",
      "postgresql://admin-user:pwd@db.project-ref.supabase.co:5432/postgres"
    );

    expect(() => validateServerRuntimeConfig()).toThrow(
      "DIRECT_URL must enforce TLS for remote production hosts (for example ?sslmode=require)."
    );
  });

  test("fails runtime validation when production direct url points to a pooler host", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://runtime-user:pwd@pooler.supabase.com:5432/postgres?sslmode=require"
    );
    vi.stubEnv(
      "DIRECT_URL",
      "postgresql://admin-user:pwd@project.pooler.supabase.com:5432/postgres?sslmode=require"
    );

    expect(() => validateServerRuntimeConfig()).toThrow(
      "DIRECT_URL must target a direct database endpoint, not a pooler host."
    );
  });

  test("fails runtime validation when supabase database url is not a pooler host in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://runtime-user:pwd@db.project-ref.supabase.co:5432/postgres?sslmode=require"
    );
    vi.stubEnv(
      "DIRECT_URL",
      "postgresql://admin-user:pwd@db.project-ref-2.supabase.co:5432/postgres?sslmode=require"
    );

    expect(() => validateServerRuntimeConfig()).toThrow(
      "DATABASE_URL must use the Supabase pooler host in production (expected *.pooler.supabase.com)."
    );
  });

  test("allows mixed provider endpoints when database is Supabase and direct is non-Supabase", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://runtime-user:pwd@project.pooler.supabase.com:5432/postgres?sslmode=require"
    );
    vi.stubEnv(
      "DIRECT_URL",
      "postgresql://admin-user:pwd@remote-db.example.com:5432/postgres?sslmode=require"
    );

    expect(() => validateServerRuntimeConfig()).not.toThrow();
  });

  test("allows mixed provider endpoints when database is non-Supabase and direct is Supabase", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://runtime-user:pwd@runtime-db.example.com:5432/postgres?sslmode=require"
    );
    vi.stubEnv(
      "DIRECT_URL",
      "postgresql://admin-user:pwd@db.project-ref.supabase.co:5432/postgres?sslmode=require"
    );

    expect(() => validateServerRuntimeConfig()).not.toThrow();
  });

  test("applies remote hardening when only direct url is remote", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://runtime-user:pwd@localhost:5432/postgres"
    );
    vi.stubEnv(
      "DIRECT_URL",
      "postgresql://admin-user:pwd@db.project-ref.supabase.co:5432/postgres"
    );

    expect(() => validateServerRuntimeConfig()).toThrow(
      "DIRECT_URL must enforce TLS for remote production hosts (for example ?sslmode=require)."
    );
  });

  test("allows local production endpoints without remote-only hardening checks", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://runtime-user:pwd@localhost:5432/postgres"
    );
    vi.stubEnv(
      "DIRECT_URL",
      "postgresql://admin-user:pwd@127.0.0.1:5432/postgres"
    );

    expect(() => validateServerRuntimeConfig()).not.toThrow();
  });
});
