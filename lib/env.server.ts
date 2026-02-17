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

export function getSupabaseClientRuntimeConfig(): SupabaseClientRuntimeConfig | null {
  const url = getOptionalServerEnv("SUPABASE_URL");
  const publishableKey = getOptionalServerEnv("SUPABASE_PUBLISHABLE_KEY");

  if (!url && !publishableKey) {
    return null;
  }

  if (!url || !publishableKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be configured together."
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

const LOCAL_DATABASE_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const SECURE_SSL_MODES = new Set(["require", "verify-ca", "verify-full"]);
const DEFAULT_POSTGRES_PORT = "5432";

interface ParsedDatabaseConnectionString {
  rawValue: string;
  host: string;
  port: string;
  isLocalHost: boolean;
  isPoolerHost: boolean;
  isSupabaseHost: boolean;
  isSupabasePoolerHost: boolean;
  usesSecureTransport: boolean;
}

function isLocalDatabaseHost(host: string): boolean {
  return LOCAL_DATABASE_HOSTS.has(host) || host.endsWith(".local");
}

function parseDatabaseConnectionString(
  name: string,
  value: string
): ParsedDatabaseConnectionString {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid absolute URL.`);
  }

  const host = parsedUrl.hostname.toLowerCase();
  const port = parsedUrl.port || DEFAULT_POSTGRES_PORT;
  const sslMode = (parsedUrl.searchParams.get("sslmode") ?? "").toLowerCase();
  const ssl = (parsedUrl.searchParams.get("ssl") ?? "").toLowerCase();
  const usesSecureTransport =
    SECURE_SSL_MODES.has(sslMode) ||
    ssl === "true" ||
    ssl === "1" ||
    ssl === "require";
  const isSupabaseHost =
    host.endsWith(".supabase.co") || host.endsWith(".supabase.com");
  const isSupabasePoolerHost = host.endsWith(".pooler.supabase.com");
  const isPoolerHost = /(^|[.-])pooler([.-]|$)/.test(host);

  return {
    rawValue: value,
    host,
    port,
    isLocalHost: isLocalDatabaseHost(host),
    isPoolerHost,
    isSupabaseHost,
    isSupabasePoolerHost,
    usesSecureTransport,
  };
}

function assertProductionDatabaseConnectionHardening(
  databaseUrl: ParsedDatabaseConnectionString,
  directUrl: ParsedDatabaseConnectionString,
  runtimeEnvironment: RuntimeEnvironment
): void {
  if (runtimeEnvironment !== "production") {
    return;
  }

  const hasRemoteHost = !databaseUrl.isLocalHost || !directUrl.isLocalHost;
  if (!hasRemoteHost) {
    return;
  }

  if (databaseUrl.rawValue === directUrl.rawValue) {
    throw new Error(
      "DATABASE_URL and DIRECT_URL must differ in production when using remote database hosts."
    );
  }

  if (
    databaseUrl.host === directUrl.host &&
    databaseUrl.port === directUrl.port
  ) {
    throw new Error(
      "DATABASE_URL and DIRECT_URL must target different endpoints in production (pooled runtime vs direct admin/migration)."
    );
  }

  if (!databaseUrl.usesSecureTransport) {
    throw new Error(
      "DATABASE_URL must enforce TLS for remote production hosts (for example ?sslmode=require)."
    );
  }

  if (!directUrl.usesSecureTransport) {
    throw new Error(
      "DIRECT_URL must enforce TLS for remote production hosts (for example ?sslmode=require)."
    );
  }

  if (directUrl.isPoolerHost) {
    throw new Error(
      "DIRECT_URL must target a direct database endpoint, not a pooler host."
    );
  }

  const isSupabaseConnection = databaseUrl.isSupabaseHost || directUrl.isSupabaseHost;
  if (!isSupabaseConnection) {
    return;
  }

  if (!databaseUrl.isSupabasePoolerHost) {
    throw new Error(
      "DATABASE_URL must use the Supabase pooler host in production (expected *.pooler.supabase.com)."
    );
  }

  if (directUrl.isSupabasePoolerHost) {
    throw new Error(
      "DIRECT_URL must use the Supabase direct host in production (for example db.<project-ref>.supabase.co), not the pooler host."
    );
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
  const parsedDatabaseUrl = parseDatabaseConnectionString(
    "DATABASE_URL",
    database.databaseUrl
  );
  const parsedDirectUrl = parseDatabaseConnectionString(
    "DIRECT_URL",
    database.directUrl
  );
  assertProductionDatabaseConnectionHardening(
    parsedDatabaseUrl,
    parsedDirectUrl,
    runtimeEnvironment
  );

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
