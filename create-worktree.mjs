#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));

function runGit(args, options = {}) {
  const output = execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: options.stdio ?? "pipe",
  });

  return typeof output === "string" ? output.trim() : "";
}

function usage() {
  console.log(`Usage:
  node create-worktree.mjs <TASK-ID|NUMBER> [branch-or-slug] [base-ref]

Examples:
  node create-worktree.mjs TASK-124 comment-mentions
  node create-worktree.mjs 124 feature/task-124-comment-mentions
  npm run worktree:create -- TASK-124 comment-mentions

Creates a worktree at ../nexus_dash_taskXXX from the project root.
If the branch exists locally or on origin, it checks out that branch.
Otherwise it creates a new branch from base-ref, defaulting to origin/main.`);
}

function normalizeTaskNumber(rawValue) {
  const match = String(rawValue ?? "").match(/^(?:TASK-?)?(\d+)$/i);
  if (!match) {
    throw new Error("First argument must be a task id like TASK-124 or 124.");
  }

  return String(Number(match[1]));
}

function normalizeSlug(rawValue) {
  return String(rawValue ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function resolveBranchName(taskNumber, rawBranchOrSlug) {
  const branchOrSlug = String(rawBranchOrSlug ?? "").trim();
  if (!branchOrSlug) {
    return `feature/task-${taskNumber}`;
  }

  if (branchOrSlug.includes("/")) {
    return branchOrSlug;
  }

  const slug = normalizeSlug(branchOrSlug);
  return slug ? `feature/task-${taskNumber}-${slug}` : `feature/task-${taskNumber}`;
}

function hasLocalBranch(branchName) {
  try {
    runGit(["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`]);
    return true;
  } catch {
    return false;
  }
}

function hasRemoteBranch(branchName) {
  try {
    runGit(["show-ref", "--verify", "--quiet", `refs/remotes/origin/${branchName}`]);
    return true;
  } catch {
    return false;
  }
}

function findWorktreeForBranch(branchName) {
  const output = runGit(["worktree", "list", "--porcelain"]);
  const entries = output.split(/\n(?=worktree )/);

  for (const entry of entries) {
    const lines = entry.split("\n");
    const worktreeLine = lines.find((line) => line.startsWith("worktree "));
    const branchLine = lines.find((line) => line.startsWith("branch "));
    if (branchLine === `branch refs/heads/${branchName}` && worktreeLine) {
      return worktreeLine.slice("worktree ".length);
    }
  }

  return null;
}

function ensureInsideRepo() {
  const root = runGit(["rev-parse", "--show-toplevel"]);
  if (path.resolve(root) !== path.resolve(repoRoot)) {
    throw new Error(`Run this script from the repository root. Detected ${root}.`);
  }
}

try {
  const [, , rawTaskId, rawBranchOrSlug, rawBaseRef] = process.argv;
  if (!rawTaskId || rawTaskId === "-h" || rawTaskId === "--help") {
    usage();
    process.exit(rawTaskId ? 0 : 1);
  }

  ensureInsideRepo();

  const taskNumber = normalizeTaskNumber(rawTaskId);
  const branchName = resolveBranchName(taskNumber, rawBranchOrSlug);
  const baseRef = rawBaseRef?.trim() || "origin/main";
  const worktreePath = path.resolve(repoRoot, "..", `nexus_dash_task${taskNumber}`);

  runGit(["fetch", "origin", "--prune"], { stdio: "inherit" });

  if (fs.existsSync(worktreePath)) {
    console.log(`Worktree already exists: ${worktreePath}`);
    console.log(`Expected branch: ${branchName}`);
    process.exit(0);
  }

  const existingBranchWorktree = findWorktreeForBranch(branchName);
  if (existingBranchWorktree) {
    console.log(`Branch is already checked out at: ${existingBranchWorktree}`);
    if (path.resolve(existingBranchWorktree) !== worktreePath) {
      console.log(`Expected task worktree path for future runs: ${worktreePath}`);
    }
    process.exit(0);
  }

  if (hasLocalBranch(branchName)) {
    runGit(["worktree", "add", worktreePath, branchName], { stdio: "inherit" });
  } else if (hasRemoteBranch(branchName)) {
    runGit(
      ["worktree", "add", "--track", "-b", branchName, worktreePath, `origin/${branchName}`],
      { stdio: "inherit" }
    );
  } else {
    runGit(["worktree", "add", "-b", branchName, worktreePath, baseRef], {
      stdio: "inherit",
    });
  }

  console.log(`Created worktree: ${worktreePath}`);
  console.log(`Branch: ${branchName}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
