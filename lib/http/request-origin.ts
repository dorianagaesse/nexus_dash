import { getOptionalServerEnv, isProductionEnvironment } from "@/lib/env.server";

const DEFAULT_LOCAL_ORIGIN = "http://localhost:3000";

interface HeaderReader {
  get(name: string): string | null;
}

function getTrustedOrigins(): string[] {
  const configuredOrigins = getOptionalServerEnv("TRUSTED_ORIGINS");
  if (!configuredOrigins) {
    return [];
  }

  return configuredOrigins
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .map((value) => {
      try {
        return new URL(value).origin;
      } catch {
        return "";
      }
    })
    .filter((value) => value.length > 0);
}

function getPrimaryHeaderValue(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const primaryValue = value.split(",")[0]?.trim();
  if (!primaryValue) {
    return null;
  }

  return primaryValue;
}

function resolveTrustedProductionOrigin(): string | null {
  const configuredTrustedOrigins = getTrustedOrigins();
  if (configuredTrustedOrigins.length > 0) {
    return configuredTrustedOrigins[0] ?? null;
  }

  const nextAuthUrl = getOptionalServerEnv("NEXTAUTH_URL");
  if (!nextAuthUrl) {
    return null;
  }

  try {
    return new URL(nextAuthUrl).origin;
  } catch {
    return null;
  }
}

function isAllowedOrigin(origin: string): boolean {
  if (!isProductionEnvironment()) {
    return true;
  }

  const trustedOrigin = resolveTrustedProductionOrigin();
  if (!trustedOrigin) {
    return false;
  }

  return origin === trustedOrigin;
}

function buildOrigin(protocol: string | null, host: string | null): string | null {
  if (!protocol || !host) {
    return null;
  }

  const normalizedProtocol = protocol.toLowerCase();
  if (normalizedProtocol !== "http" && normalizedProtocol !== "https") {
    return null;
  }

  try {
    return new URL(`${normalizedProtocol}://${host}`).origin;
  } catch {
    return null;
  }
}

export function resolveRequestOriginFromHeaders(headers: HeaderReader): string {
  const trustedOrigin = resolveTrustedProductionOrigin();
  if (isProductionEnvironment()) {
    if (trustedOrigin) {
      return trustedOrigin;
    }

    throw new Error(
      "Unable to resolve trusted request origin in production. Configure TRUSTED_ORIGINS or NEXTAUTH_URL."
    );
  }

  const forwardedOrigin = buildOrigin(
    getPrimaryHeaderValue(headers.get("x-forwarded-proto")),
    getPrimaryHeaderValue(headers.get("x-forwarded-host"))
  );
  if (forwardedOrigin && isAllowedOrigin(forwardedOrigin)) {
    return forwardedOrigin;
  }

  const host = getPrimaryHeaderValue(headers.get("host"));
  if (host) {
    const protocol = host.includes("localhost") ? "http" : "https";
    const directOrigin = buildOrigin(protocol, host);
    if (directOrigin && isAllowedOrigin(directOrigin)) {
      return directOrigin;
    }
  }

  if (trustedOrigin) {
    return trustedOrigin;
  }

  return DEFAULT_LOCAL_ORIGIN;
}
