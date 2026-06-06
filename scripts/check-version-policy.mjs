#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";

const VERSION_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)$/;
const VERSION_METADATA_FILES = new Set([
  "package.json",
  "package-lock.json",
  "CHANGELOG.md",
]);
const PRODUCT_FILE_PATTERNS = [
  /^app\//,
  /^components\//,
  /^lib\//,
  /^prisma\//,
  /^public\//,
  /^styles\//,
  /^middleware\.(js|ts)$/,
  /^next\.config\./,
  /^postcss\.config\./,
  /^tailwind\.config\./,
  /^tsconfig\.json$/,
  /^Dockerfile$/,
];
const NO_RELEASE_IMPACT_LABELS = new Set([
  "no-release-impact",
  "release:none",
]);

function usage() {
  console.log(`Usage:
  npm run release:check -- [--base <ref>] [--head <ref>] [--branch <name>]

Examples:
  npm run release:check -- --base origin/main --branch feature/task-313-version-governance
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

function readJsonFromWorkingTree(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readJsonFromGit(ref, path) {
  return JSON.parse(runGit(["show", `${ref}:${path}`]));
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

function assertPackageVersionsMatch(packageJson, packageLock, label) {
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

function expectedVersion(baseVersion, branchType) {
  if (branchType === "feature") {
    return {
      major: baseVersion.major,
      minor: baseVersion.minor + 1,
      patch: 0,
    };
  }

  return {
    major: baseVersion.major,
    minor: baseVersion.minor,
    patch: baseVersion.patch + 1,
  };
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

function isProductFile(file) {
  if (VERSION_METADATA_FILES.has(file)) {
    return false;
  }

  return PRODUCT_FILE_PATTERNS.some((pattern) => pattern.test(file));
}

function readEventLabels() {
  const labels = new Set();
  const rawLabels = process.env.VERSION_POLICY_LABELS;
  if (rawLabels) {
    for (const label of rawLabels.split(",")) {
      const normalized = label.trim().toLowerCase();
      if (normalized) {
        labels.add(normalized);
      }
    }
  }

  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) {
    return labels;
  }

  try {
    const event = JSON.parse(readFileSync(eventPath, "utf8"));
    for (const label of event.pull_request?.labels ?? []) {
      const name = String(label.name ?? "").trim().toLowerCase();
      if (name) {
        labels.add(name);
      }
    }
  } catch {
    return labels;
  }

  return labels;
}

function hasNoReleaseImpactDecision(labels) {
  return [...labels].some((label) => NO_RELEASE_IMPACT_LABELS.has(label));
}

function assertChangelogEntry({ changedFiles, headRef, version }) {
  if (!changedFiles.includes("CHANGELOG.md")) {
    fail("Version bumps must update CHANGELOG.md with release notes.");
  }

  const changelog =
    headRef === "HEAD"
      ? readFileSync("CHANGELOG.md", "utf8")
      : runGit(["show", `${headRef}:CHANGELOG.md`]);
  const heading = `## v${formatVersion(version)}`;
  if (!changelog.includes(heading)) {
    fail(`CHANGELOG.md must include a ${heading} entry.`);
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
  const labels = readEventLabels();

  if (branchType === "dependabot") {
    info("Dependabot branch detected; product version policy guard skipped.");
    process.exit(0);
  }

  const basePackageJson = readJsonFromGit(options.baseRef, "package.json");
  const basePackageLock = readJsonFromGit(options.baseRef, "package-lock.json");
  const headPackageJson =
    options.headRef === "HEAD"
      ? readJsonFromWorkingTree("package.json")
      : readJsonFromGit(options.headRef, "package.json");
  const headPackageLock =
    options.headRef === "HEAD"
      ? readJsonFromWorkingTree("package-lock.json")
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
  const changedFiles = readChangedFiles(options.baseRef, options.headRef);
  const productFiles = changedFiles.filter(isProductFile);
  const noReleaseImpact = hasNoReleaseImpactDecision(labels);
  const productionBound =
    branchType === "feature" ||
    branchType === "fix" ||
    branchType === "refactor" ||
    (branchType === "chore" && productFiles.length > 0);

  info(`Branch: ${branchName}`);
  info(`Base version: ${formatVersion(baseVersion)}`);
  info(`Head version: ${formatVersion(headVersion)}`);

  if (!productionBound) {
    if (versionChanged && compareVersions(headVersion, baseVersion) <= 0) {
      fail("Version metadata changed, but the target version is not greater than base.");
    }

    if (versionChanged) {
      assertChangelogEntry({
        changedFiles,
        headRef: options.headRef,
        version: headVersion,
      });
    }

    info("No production-bound version bump required for this branch.");
    process.exit(0);
  }

  if (noReleaseImpact && !versionChanged) {
    info("No-release-impact decision found; product version bump is not required.");
    process.exit(0);
  }

  if (!versionChanged) {
    fail(
      `${branchType}/ branches that ship product changes must include a product version bump, or carry a no-release-impact/release:none label.`
    );
  }

  const expected = expectedVersion(baseVersion, branchType);
  if (compareVersions(headVersion, expected) !== 0) {
    const expectedKind = branchType === "feature" ? "minor" : "patch";
    fail(
      `${branchType}/ branches must use a ${expectedKind} bump: expected ${formatVersion(expected)}, received ${formatVersion(headVersion)}.`
    );
  }

  assertChangelogEntry({
    changedFiles,
    headRef: options.headRef,
    version: headVersion,
  });

  info("Product version policy check passed.");
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
