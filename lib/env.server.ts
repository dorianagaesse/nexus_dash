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

export function getDatabaseRuntimeConfig(): DatabaseRuntimeConfig {
  const databaseUrl = getRequiredServerEnv("DATABASE_URL");
  const directUrl = getOptionalServerEnv("DIRECT_URL") ?? databaseUrl;

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
