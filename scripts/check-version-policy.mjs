#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";

import {
  parseVersion,
  formatVersion,
  compareVersions,
  readJsonFile,
  assertPackageVersionsMatch,
} from "./version-utils.mjs";

const RELEASE_BRANCH_PATTERN = /^chore\/release-v(\d+\.\d+\.\d+)(?:$|[-_])/;
const RELEASE_PREP_FILES = new Set([
  "package.json",
  "package-lock.json",
  "CHANGELOG.md",
  "journal.md",
]);
const RELEASE_PREP_FILE_PREFIXES = ["docs/releases/"];

function usage() {
  console.log(`Usage:
  npm run release:check -- [--base <ref>] [--head <ref>] [--branch <name>]

Validates the release-boundary version policy:
- Product branches (feature/, fix/, refactor/, docs/, chore/, dependabot/)
  must not change the product version; they join the next release.
- Release-preparation branches (chore/release-vX.Y.Z) must carry exactly that
  version in package.json and package-lock.json, move forward from the base
  version, stay metadata-only, and include a non-empty CHANGELOG.md section.

Examples:
  npm run release:check -- --base origin/main --branch chore/release-v0.74.0
  npm run release:check`);
}

function fail(message) {
  console.error(`[version-policy] ${message}`);
  process.exit(1);
}

function info(message) {
  console.log(`[version-policy] ${message}`);
}

function runGit(args, options = {}) {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    ...options,
  });

  if (result.error) {
    throw new Error(`git ${args.join(" ")} failed to start: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    throw new Error(
      `git ${args.join(" ")} failed${stderr ? `: ${stderr}` : "."}`
    );
  }

  return result.stdout;
}

function readJsonFromGit(ref, path) {
  return JSON.parse(runGit(["show", `${ref}:${path}`]));
}

function uniqueFiles(files) {
  return [...new Set(files)].sort();
}

function readChangedFiles(baseRef, headRef) {
  const committedOutput = runGit(["diff", "--name-only", `${baseRef}...${headRef}`]);
  const workingTreeOutput =
    headRef === "HEAD" ? runGit(["diff", "--name-only"]) : "";
  return uniqueFiles(`${committedOutput}\n${workingTreeOutput}`
    .split(/\r?\n/)
    .map((file) => file.trim().replaceAll("\\", "/"))
    .filter(Boolean));
}

function inferBranchName() {
  const envBranch =
    process.env.VERSION_POLICY_BRANCH_NAME ??
    process.env.GITHUB_HEAD_REF ??
    process.env.PULL_REQUEST_BRANCH_NAME;
  if (envBranch) {
    return envBranch;
  }

  return runGit(["branch", "--show-current"]).trim();
}

function getBranchType(branchName) {
  if (!branchName.includes("/")) {
    return branchName;
  }

  return branchName.split("/", 1)[0];
}

function isReleasePrepFile(file) {
  return (
    RELEASE_PREP_FILES.has(file) ||
    RELEASE_PREP_FILE_PREFIXES.some((prefix) => file.startsWith(prefix))
  );
}

function changelogSectionBody(changelog, version) {
  const heading = `## v${formatVersion(version)}`;
  const lines = changelog.split(/\r?\n/);
  const headingIndex = lines.findIndex(
    (line) => line.trim() === heading || line.trim().startsWith(`${heading} `)
  );
  if (headingIndex === -1) {
    return null;
  }

  const body = [];
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    if (/^##\s/.test(lines[index])) {
      break;
    }
    body.push(lines[index]);
  }

  return body;
}

function assertChangelogEntry({ changedFiles, headRef, version }) {
  if (!changedFiles.includes("CHANGELOG.md")) {
    fail("Release-preparation PRs must update CHANGELOG.md with the release entry.");
  }

  const changelog =
    headRef === "HEAD"
      ? readFileSync("CHANGELOG.md", "utf8")
      : runGit(["show", `${headRef}:CHANGELOG.md`]);
  const heading = `## v${formatVersion(version)}`;
  const sectionBody = changelogSectionBody(changelog, version);
  if (!sectionBody) {
    fail(`CHANGELOG.md must include a ${heading} section for the release.`);
  }

  if (!sectionBody.some((line) => /^[-*]\s+\S/.test(line.trim()))) {
    fail(`${heading} must include at least one release entry bullet.`);
  }
}

function parseArgs(argv) {
  const options = {
    baseRef: process.env.VERSION_POLICY_BASE_REF ?? "origin/main",
    headRef: process.env.VERSION_POLICY_HEAD_REF ?? "HEAD",
    branchName: process.env.VERSION_POLICY_BRANCH_NAME ?? null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }

    if (arg === "--base") {
      options.baseRef = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--head") {
      options.headRef = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--branch") {
      options.branchName = argv[index + 1];
      index += 1;
      continue;
    }

    fail(`Unknown argument: ${arg}`);
  }

  if (!options.baseRef || !options.headRef) {
    fail("Both base and head refs are required.");
  }

  return options;
}

try {
  const options = parseArgs(process.argv.slice(2));
  const branchName = options.branchName ?? inferBranchName();
  const branchType = getBranchType(branchName);
  const releaseMatch = branchName.match(RELEASE_BRANCH_PATTERN);

  const basePackageJson = readJsonFromGit(options.baseRef, "package.json");
  const basePackageLock = readJsonFromGit(options.baseRef, "package-lock.json");
  const headPackageJson =
    options.headRef === "HEAD"
      ? readJsonFile("package.json")
      : readJsonFromGit(options.headRef, "package.json");
  const headPackageLock =
    options.headRef === "HEAD"
      ? readJsonFile("package-lock.json")
      : readJsonFromGit(options.headRef, "package-lock.json");

  const baseVersion = assertPackageVersionsMatch(
    basePackageJson,
    basePackageLock,
    "Base"
  );
  const headVersion = assertPackageVersionsMatch(
    headPackageJson,
    headPackageLock,
    "Head"
  );
  const versionChanged = compareVersions(baseVersion, headVersion) !== 0;

  info(`Branch: ${branchName}`);
  info(`Base version: ${formatVersion(baseVersion)}`);
  info(`Head version: ${formatVersion(headVersion)}`);

  if (!releaseMatch) {
    if (versionChanged) {
      fail(
        `Product version changes are only allowed on release-preparation branches (chore/release-vX.Y.Z). Keep package.json and package-lock.json at ${formatVersion(baseVersion)}; the release moves the version at its preparation boundary.`
      );
    }

    info(
      `No version metadata change on this ${branchType} branch; it joins the next production release at that release's preparation boundary.`
    );
    info("Version policy check passed.");
    process.exit(0);
  }

  const claimedVersion = parseVersion(releaseMatch[1]);
  const claimedLabel = formatVersion(claimedVersion);

  if (!versionChanged) {
    fail(
      `Release-preparation branch must bump package.json and package-lock.json to ${claimedLabel}.`
    );
  }

  if (compareVersions(headVersion, claimedVersion) !== 0) {
    fail(
      `Release-preparation branch name must match the released version: expected ${claimedLabel}, received ${formatVersion(headVersion)}.`
    );
  }

  if (compareVersions(headVersion, baseVersion) <= 0) {
    fail(
      `Release version ${formatVersion(headVersion)} must be greater than the current main version ${formatVersion(baseVersion)}. Main moved past this release; rebase and prepare the next release version.`
    );
  }

  const changedFiles = readChangedFiles(options.baseRef, options.headRef);
  const productChanges = changedFiles.filter((file) => !isReleasePrepFile(file));
  if (productChanges.length > 0) {
    fail(
      `Release-preparation PRs are metadata-only; move non-release changes to their own PR: ${productChanges.join(", ")}`
    );
  }

  assertChangelogEntry({
    changedFiles,
    headRef: options.headRef,
    version: headVersion,
  });

  info(
    `Release-preparation branch carries version ${formatVersion(headVersion)} with a matching changelog entry.`
  );
  info("Version policy check passed.");
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
