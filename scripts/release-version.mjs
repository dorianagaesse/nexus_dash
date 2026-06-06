#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";

const VERSION_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)$/;
const BUMP_ALIASES = new Map([
  ["patch", "patch"],
  ["fix", "patch"],
  ["refactor", "patch"],
  ["chore", "patch"],
  ["minor", "minor"],
  ["feature", "minor"],
  ["major", "major"],
]);

function usage() {
  console.log(`Usage:
  npm run release:version -- <feature|fix|refactor|chore|patch|minor|major|x.y.z> [--dry-run]

Examples:
  npm run release:version -- feature --dry-run
  npm run release:version -- patch --dry-run
  npm run release:version -- minor
  npm run release:version -- 1.0.0`);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function parseVersion(rawVersion) {
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

function formatVersion(version) {
  return `${version.major}.${version.minor}.${version.patch}`;
}

function compareVersions(left, right) {
  for (const key of ["major", "minor", "patch"]) {
    if (left[key] !== right[key]) {
      return left[key] - right[key];
    }
  }

  return 0;
}

function bumpVersion(current, bumpType) {
  switch (bumpType) {
    case "patch":
      return { ...current, patch: current.patch + 1 };
    case "minor":
      return { major: current.major, minor: current.minor + 1, patch: 0 };
    case "major":
      return { major: current.major + 1, minor: 0, patch: 0 };
    default:
      return parseVersion(bumpType);
  }
}

function runNpmVersion(targetVersion) {
  const command = process.platform === "win32" ? "cmd.exe" : "npm";
  const args =
    process.platform === "win32"
      ? ["/d", "/s", "/c", `npm version ${targetVersion} --no-git-tag-version`]
      : ["version", targetVersion, "--no-git-tag-version"];
  const result = spawnSync(command, args, {
    stdio: "inherit",
  });

  if (result.error) {
    throw new Error(`npm version failed to start: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const status = result.status ?? result.signal ?? "unknown";
    throw new Error(`npm version failed with status ${status}.`);
  }
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const wantsHelp = args.includes("--help") || args.includes("-h");
const positional = args.filter((arg) => arg !== "--dry-run");

if (wantsHelp) {
  usage();
  process.exit(0);
}

if (positional.length !== 1) {
  usage();
  process.exit(1);
}

try {
  const requested = positional[0];
  const resolvedRequest = BUMP_ALIASES.get(requested) ?? requested;
  if (!BUMP_ALIASES.has(requested) && !VERSION_PATTERN.test(requested)) {
    throw new Error(
      `Expected feature, fix, refactor, chore, patch, minor, major, or x.y.z; received ${requested}.`
    );
  }

  const packageJson = readJson("package.json");
  const packageLock = readJson("package-lock.json");
  const current = parseVersion(packageJson.version);
  const lockVersion = parseVersion(packageLock.version);
  const rootLockVersion = parseVersion(packageLock.packages?.[""]?.version);

  if (
    compareVersions(current, lockVersion) !== 0 ||
    compareVersions(current, rootLockVersion) !== 0
  ) {
    throw new Error(
      "package.json and package-lock.json versions differ. Resolve that before preparing a release."
    );
  }

  const target = bumpVersion(current, resolvedRequest);
  if (compareVersions(target, current) <= 0) {
    throw new Error(
      `Target version ${formatVersion(target)} must be greater than current version ${formatVersion(current)}.`
    );
  }

  const targetVersion = formatVersion(target);
  console.log(`[release-version] Current product version: ${formatVersion(current)}`);
  console.log(`[release-version] Target product version: ${targetVersion}`);
  console.log(`[release-version] Tag to create after merge: v${targetVersion}`);

  if (dryRun) {
    console.log("[release-version] Dry run only; package files were not changed.");
  } else {
    runNpmVersion(targetVersion);
    console.log(
      "[release-version] Updated package.json and package-lock.json. Add release notes before opening the release PR."
    );
  }
} catch (error) {
  console.error(error instanceof Error ? `[release-version] ${error.message}` : error);
  process.exit(1);
}
