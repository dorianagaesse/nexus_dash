import packageJson from "@/package.json";

const DEFAULT_REPOSITORY_URL = "https://github.com/dorianagaesse/nexus_dash";
const SEMVER_WITH_OPTIONAL_PRERELEASE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export type AppRuntimeEnvironment =
  | "production"
  | "preview"
  | "development"
  | "test"
  | "unknown";

function readOptionalEnv(name: string): string | null {
  const value = process.env[name];
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeVersion(rawVersion: string, fallbackVersion = "0.0.0"): string {
  const trimmed = rawVersion.trim();
  if (!trimmed) {
    return normalizeVersion(fallbackVersion, "0.0.0");
  }

  const withoutPrefix = trimmed.startsWith("v") ? trimmed.slice(1) : trimmed;
  const visibleVersion = withoutPrefix.split("+")[0] ?? "";
  if (!SEMVER_WITH_OPTIONAL_PRERELEASE.test(visibleVersion)) {
    if (fallbackVersion !== rawVersion) {
      return normalizeVersion(fallbackVersion, "0.0.0");
    }

    return "v0.0.0";
  }

  return `v${visibleVersion}`;
}

function readVersion(): string {
  const packageVersion = packageJson.version ?? "0.0.0";
  const configuredVersion =
    readOptionalEnv("APP_VERSION") ?? readOptionalEnv("NEXT_PUBLIC_APP_VERSION");
  if (configuredVersion) {
    return normalizeVersion(configuredVersion, packageVersion);
  }

  return normalizeVersion(packageVersion);
}

function readRevision(): string | null {
  const revision =
    readOptionalEnv("VERCEL_GIT_COMMIT_SHA") ??
    readOptionalEnv("GITHUB_SHA") ??
    readOptionalEnv("COMMIT_SHA");
  if (!revision) {
    return null;
  }

  return revision.slice(0, 7);
}

function normalizeRuntimeEnvironment(rawEnvironment: string | null): AppRuntimeEnvironment {
  switch (rawEnvironment?.toLowerCase()) {
    case "production":
      return "production";
    case "preview":
      return "preview";
    case "development":
    case "dev":
      return "development";
    case "test":
      return "test";
    default:
      return "unknown";
  }
}

function readRuntimeEnvironment(): AppRuntimeEnvironment {
  return normalizeRuntimeEnvironment(
    readOptionalEnv("APP_ENV") ??
      readOptionalEnv("NEXT_PUBLIC_APP_ENV") ??
      readOptionalEnv("VERCEL_ENV") ??
      readOptionalEnv("NODE_ENV")
  );
}

function normalizeRepositoryUrl(rawUrl: string | null): string {
  if (!rawUrl) {
    return DEFAULT_REPOSITORY_URL;
  }

  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return DEFAULT_REPOSITORY_URL;
  }

  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed);
  const candidate = hasScheme ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
  } catch {
    return DEFAULT_REPOSITORY_URL;
  }

  return DEFAULT_REPOSITORY_URL;
}

function readRepositoryUrl(): string {
  return normalizeRepositoryUrl(readOptionalEnv("APP_REPOSITORY_URL"));
}

export interface AppMetadataSummary {
  repositoryUrl: string;
  versionTag: string;
  versionLabel: string;
  revision: string | null;
  revisionLabel: string | null;
  environment: AppRuntimeEnvironment;
  diagnosticLabel: string;
}

export function getAppMetadataSummary(): AppMetadataSummary {
  const versionTag = readVersion();
  const revision = readRevision();
  const revisionLabel = revision ? `build ${revision}` : null;
  const environment = readRuntimeEnvironment();
  const diagnosticParts = [versionTag, environment];
  if (revisionLabel) {
    diagnosticParts.push(revisionLabel);
  }

  return {
    repositoryUrl: readRepositoryUrl(),
    versionTag,
    versionLabel: versionTag,
    revision,
    revisionLabel,
    environment,
    diagnosticLabel: diagnosticParts.join(" | "),
  };
}
