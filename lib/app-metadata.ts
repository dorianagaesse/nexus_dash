import packageJson from "@/package.json";

const DEFAULT_REPOSITORY_URL = "https://github.com/dorianagaesse/nexus_dash";

function readOptionalEnv(name: string): string | null {
  const value = process.env[name];
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeVersion(rawVersion: string): string {
  const trimmed = rawVersion.trim();
  if (!trimmed) {
    return "v0.0.0";
  }

  return trimmed.startsWith("v") ? trimmed : `v${trimmed}`;
}

function readVersion(): string {
  const configuredVersion =
    readOptionalEnv("APP_VERSION") ?? readOptionalEnv("NEXT_PUBLIC_APP_VERSION");
  if (configuredVersion) {
    return normalizeVersion(configuredVersion);
  }

  return normalizeVersion(packageJson.version ?? "0.0.0");
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
}

export function getAppMetadataSummary(): AppMetadataSummary {
  const versionTag = readVersion();
  const revision = readRevision();

  return {
    repositoryUrl: readRepositoryUrl(),
    versionTag,
    versionLabel: revision ? `${versionTag}+${revision}` : versionTag,
    revision,
  };
}
