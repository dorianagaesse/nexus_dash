export type RuntimeEnvironment = "development" | "test" | "production";

function readRawEnv(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : undefined;
}

export function getRequiredServerEnv(name: string): string {
  const value = readRawEnv(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getOptionalServerEnv(name: string): string | null {
  return readRawEnv(name) ?? null;
}

export function getRuntimeEnvironment(): RuntimeEnvironment {
  const nodeEnv = readRawEnv("NODE_ENV");
  if (nodeEnv === "production" || nodeEnv === "test") {
    return nodeEnv;
  }

  return "development";
}

export function isProductionEnvironment(): boolean {
  return getRuntimeEnvironment() === "production";
}

export interface DatabaseRuntimeConfig {
  databaseUrl: string;
  directUrl: string;
}

export interface DatabaseRuntimeConfigOptions {
  runtimeEnvironment?: RuntimeEnvironment;
}

export function getDatabaseRuntimeConfig(
  options: DatabaseRuntimeConfigOptions = {}
): DatabaseRuntimeConfig {
  const runtimeEnvironment =
    options.runtimeEnvironment ?? getRuntimeEnvironment();
  const databaseUrl = getRequiredServerEnv("DATABASE_URL");
  const directUrl = getOptionalServerEnv("DIRECT_URL");

  if (!directUrl) {
    if (runtimeEnvironment === "production") {
      throw new Error(
        "Missing required environment variable: DIRECT_URL (required in production)"
      );
    }

    return {
      databaseUrl,
      directUrl: databaseUrl,
    };
  }

  return {
    databaseUrl,
    directUrl,
  };
}

export interface SupabaseClientRuntimeConfig {
  url: string;
  publishableKey: string;
}

function getSupabasePublishableKey(): string | null {
  const modernKey = getOptionalServerEnv("SUPABASE_PUBLISHABLE_KEY");
  if (modernKey) {
    return modernKey;
  }

  // Backward compatibility for older environments not yet migrated.
  // IMPORTANT: SUPABASE_API_KEY here must be the legacy publishable/anon key,
  // never a service-role key.
  // TODO(task-022): remove SUPABASE_API_KEY fallback after env migration completes.
  return getOptionalServerEnv("SUPABASE_API_KEY");
}

export function getSupabaseClientRuntimeConfig(): SupabaseClientRuntimeConfig | null {
  const url = getOptionalServerEnv("SUPABASE_URL");
  const publishableKey = getSupabasePublishableKey();

  if (!url && !publishableKey) {
    return null;
  }

  if (!url || !publishableKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (or legacy SUPABASE_API_KEY) must be configured together."
    );
  }

  return {
    url,
    publishableKey,
  };
}

export type StorageProviderKind = "local" | "r2";

export interface R2StorageRuntimeConfig {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  signedUrlTtlSeconds: number;
}

export interface StorageRuntimeConfig {
  provider: StorageProviderKind;
  r2: R2StorageRuntimeConfig | null;
}

function parsePositiveInteger(input: string | null): number | null {
  if (!input) {
    return null;
  }

  const parsed = Number.parseInt(input, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

export function getStorageRuntimeConfig(): StorageRuntimeConfig {
  const providerRaw = getOptionalServerEnv("STORAGE_PROVIDER");
  const provider: StorageProviderKind =
    providerRaw === "r2" ? "r2" : "local";

  if (providerRaw && providerRaw !== "local" && providerRaw !== "r2") {
    throw new Error("STORAGE_PROVIDER must be one of: local, r2.");
  }

  if (provider === "local") {
    return { provider, r2: null };
  }

  const signedUrlTtlSeconds =
    parsePositiveInteger(getOptionalServerEnv("R2_SIGNED_URL_TTL_SECONDS")) ??
    300;

  return {
    provider,
    r2: {
      accountId: getRequiredServerEnv("R2_ACCOUNT_ID"),
      accessKeyId: getRequiredServerEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: getRequiredServerEnv("R2_SECRET_ACCESS_KEY"),
      bucketName: getRequiredServerEnv("R2_BUCKET_NAME"),
      signedUrlTtlSeconds,
    },
  };
}

function assertOptionalEnvironmentGroup(
  names: string[],
  message: string
): void {
  const providedCount = names.reduce((count, name) => {
    return getOptionalServerEnv(name) ? count + 1 : count;
  }, 0);

  if (providedCount > 0 && providedCount < names.length) {
    throw new Error(message);
  }
}

function assertValidUrl(name: string, value: string): void {
  try {
    // URL constructor ensures protocol/host parsing.
    new URL(value);
  } catch {
    throw new Error(`${name} must be a valid absolute URL.`);
  }
}

function assertPostgresConnectionString(name: string, value: string): void {
  if (!/^postgres(ql)?:\/\//.test(value)) {
    throw new Error(`${name} must use a PostgreSQL connection string.`);
  }
}

export interface ServerRuntimeValidationOptions {
  runtimeEnvironment?: RuntimeEnvironment;
}

export function validateServerRuntimeConfig(
  options: ServerRuntimeValidationOptions = {}
): void {
  const runtimeEnvironment =
    options.runtimeEnvironment ?? getRuntimeEnvironment();
  const database = getDatabaseRuntimeConfig({ runtimeEnvironment });

  assertPostgresConnectionString("DATABASE_URL", database.databaseUrl);
  assertPostgresConnectionString("DIRECT_URL", database.directUrl);

  const supabaseConfig = getSupabaseClientRuntimeConfig();
  if (supabaseConfig) {
    assertValidUrl("SUPABASE_URL", supabaseConfig.url);
  }

  assertOptionalEnvironmentGroup(
    ["NEXTAUTH_URL", "NEXTAUTH_SECRET"],
    "NEXTAUTH_URL and NEXTAUTH_SECRET must be configured together."
  );

  const nextAuthUrl = getOptionalServerEnv("NEXTAUTH_URL");
  if (nextAuthUrl) {
    assertValidUrl("NEXTAUTH_URL", nextAuthUrl);
  }

  assertOptionalEnvironmentGroup(
    ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI"],
    "GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI must be configured together."
  );

  const googleRedirectUri = getOptionalServerEnv("GOOGLE_REDIRECT_URI");
  if (googleRedirectUri) {
    assertValidUrl("GOOGLE_REDIRECT_URI", googleRedirectUri);
  }

  assertOptionalEnvironmentGroup(
    ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME"],
    "R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME must be configured together."
  );

  const r2SignedUrlTtlRaw = getOptionalServerEnv("R2_SIGNED_URL_TTL_SECONDS");
  if (r2SignedUrlTtlRaw && !parsePositiveInteger(r2SignedUrlTtlRaw)) {
    throw new Error("R2_SIGNED_URL_TTL_SECONDS must be a positive integer.");
  }

  getStorageRuntimeConfig();
}
