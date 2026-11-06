#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import process from "node:process";

import {
  VERSION_PATTERN,
  parseVersion,
  formatVersion,
  compareVersions,
  readJsonFile,
  assertPackageVersionsMatch,
  bumpVersion,
} from "./version-utils.mjs";

const BUMP_TYPES = new Set(["minor", "patch", "major"]);

function usage() {
  console.log(`Usage:
  npm run release:version -- <minor|patch|major|x.y.z> [--dry-run]

Release-preparation helper. Run it on a chore/release-vX.Y.Z branch to move
package.json and package-lock.json to the next production release version:
minor for capability releases, patch for fix-only releases, major only for the
1.0.0 stable baseline.

Examples:
  npm run release:version -- minor --dry-run
  npm run release:version -- patch
  npm run release:version -- 1.0.0`);
}

function currentBranchName() {
  const result = spawnSync("git", ["branch", "--show-current"], {
    encoding: "utf8",
  });

  if (result.error || result.status !== 0) {
    return "";
  }

  return result.stdout.trim();
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
  if (!BUMP_TYPES.has(requested) && !VERSION_PATTERN.test(requested)) {
    throw new Error(
      `Expected minor, patch, major, or an explicit x.y.z version; received ${requested}.`
    );
  }

  const packageJson = readJsonFile("package.json");
  const packageLock = readJsonFile("package-lock.json");
  const current = assertPackageVersionsMatch(
    packageJson,
    packageLock,
    "Current"
  );

  const target = BUMP_TYPES.has(requested)
    ? bumpVersion(current, requested)
    : parseVersion(requested);
  if (compareVersions(target, current) <= 0) {
    throw new Error(
      `Target version ${formatVersion(target)} must be greater than current version ${formatVersion(current)}.`
    );
  }
  const impact = [...BUMP_TYPES].find(
    (candidate) => compareVersions(bumpVersion(current, candidate), target) === 0
  );
  if (!impact) {
    const choices = [...BUMP_TYPES].map(
      (candidate) => `${candidate}: ${formatVersion(bumpVersion(current, candidate))}`
    );
    throw new Error(
      `Target version ${formatVersion(target)} must be an exact next release step (${choices.join(", ")}). See docs/runbooks/release-versioning.md.`
    );
  }

  const targetVersion = formatVersion(target);
  const releaseBranch = `chore/release-v${targetVersion}`;
  console.log(`[release-version] Current product version: ${formatVersion(current)}`);
  console.log(`[release-version] Target product version: ${targetVersion}`);
  console.log(`[release-version] Release-preparation branch: ${releaseBranch}`);
  console.log(`[release-version] Tag to create after merge: v${targetVersion}`);
  console.log("[release-version] In the matching CHANGELOG.md section, record:");
  console.log(`Release impact: ${impact}`);
  console.log("Release rationale: <explain the release contents and chosen impact>");
  if (current.major === 0 && impact === "major") {
    console.log("[release-version] Only after the maintainer approves the stable baseline, add:");
    console.log("Stable baseline approved: yes");
  }

  const branch = currentBranchName();
  if (branch && !branch.startsWith(releaseBranch)) {
    console.log(
      `[release-version] Note: current branch "${branch}" is not ${releaseBranch}; release preparation runs on its dedicated branch.`
    );
  }

  if (dryRun) {
    console.log("[release-version] Dry run only; package files were not changed.");
  } else {
    runNpmVersion(targetVersion);
    console.log(
      `[release-version] package.json and package-lock.json moved to ${targetVersion}. Add the matching CHANGELOG.md entry, then run release:check.`
    );
  }
} catch (error) {
  console.error(error instanceof Error ? `[release-version] ${error.message}` : error);
  process.exit(1);
}
