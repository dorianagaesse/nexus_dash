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
