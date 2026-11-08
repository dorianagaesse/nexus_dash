import { readFileSync } from "node:fs";

export const VERSION_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)$/;

export function parseVersion(rawVersion) {
  const match = String(rawVersion ?? "").match(VERSION_PATTERN);
  if (!match) {
    throw new Error(`Invalid product version: ${rawVersion}`);
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

export function formatVersion(version) {
  return `${version.major}.${version.minor}.${version.patch}`;
}

export function compareVersions(left, right) {
  for (const key of ["major", "minor", "patch"]) {
    if (left[key] !== right[key]) {
      return left[key] - right[key];
    }
  }

  return 0;
}

export function bumpVersion(current, impact) {
  switch (impact) {
    case "patch":
      return { ...current, patch: current.patch + 1 };
    case "minor":
      return { major: current.major, minor: current.minor + 1, patch: 0 };
    case "major":
      return { major: current.major + 1, minor: 0, patch: 0 };
    default:
      throw new Error(`Invalid release impact: ${impact}. Use patch, minor, or major.`);
  }
}

export function readJsonFile(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function assertPackageVersionsMatch(packageJson, packageLock, label) {
  const packageVersion = parseVersion(packageJson.version);
  const lockVersion = parseVersion(packageLock.version);
  const rootLockVersion = parseVersion(packageLock.packages?.[""]?.version);

  if (
    compareVersions(packageVersion, lockVersion) !== 0 ||
    compareVersions(packageVersion, rootLockVersion) !== 0
  ) {
    throw new Error(
      `${label} package.json and package-lock.json versions must match.`
    );
  }

  return packageVersion;
}
