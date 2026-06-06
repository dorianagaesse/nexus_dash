import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, test } from "vitest";

const SCRIPT_PATH = join(process.cwd(), "scripts/check-version-policy.mjs");

function runCommand(cwd: string, command: string, args: string[]) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed:\n${result.stdout}\n${result.stderr}`
    );
  }

  return result;
}

function git(cwd: string, args: string[]) {
  return runCommand(cwd, "git", args);
}

function writeJson(path: string, value: unknown) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function writePackageFiles(cwd: string, version: string) {
  writeJson(join(cwd, "package.json"), {
    name: "nexusdash",
    version,
    private: true,
  });
  writeJson(join(cwd, "package-lock.json"), {
    name: "nexusdash",
    version,
    lockfileVersion: 3,
    packages: {
      "": {
        name: "nexusdash",
        version,
      },
    },
  });
}

function writeText(cwd: string, path: string, content: string) {
  const fullPath = join(cwd, path);
  mkdirSync(join(fullPath, ".."), { recursive: true });
  writeFileSync(fullPath, content);
}

function commitAll(cwd: string, message: string) {
  git(cwd, ["add", "."]);
  git(cwd, [
    "-c",
    "user.name=NexusDash Test",
    "-c",
    "user.email=test@nexusdash.local",
    "commit",
    "-m",
    message,
  ]);
}

function createRepo() {
  const cwd = mkdtempSync(join(tmpdir(), "nexusdash-version-policy-"));
  git(cwd, ["init", "-b", "main"]);
  writePackageFiles(cwd, "0.2.0");
  writeText(
    cwd,
    "CHANGELOG.md",
    "# Changelog\n\n## Unreleased\n\n- Define each release entry before the release PR is merged.\n"
  );
  commitAll(cwd, "base");
  return cwd;
}

function runPolicy(cwd: string, branch: string) {
  return spawnSync(
    process.execPath,
    [SCRIPT_PATH, "--base", "main", "--branch", branch],
    {
      cwd,
      encoding: "utf8",
      env: {
        ...process.env,
        GITHUB_EVENT_PATH: "",
      },
    }
  );
}

describe("version policy guard", () => {
  const repos: string[] = [];

  afterEach(() => {
    for (const repo of repos.splice(0)) {
      rmSync(repo, { force: true, recursive: true });
    }
  });

  test("allows feature branches with a minor bump and changelog entry", () => {
    const cwd = createRepo();
    repos.push(cwd);
    git(cwd, ["checkout", "-b", "feature/task-313-version-governance"]);
    writePackageFiles(cwd, "0.3.0");
    writeText(cwd, "app/page.tsx", "export default function Page() { return null; }\n");
    writeText(
      cwd,
      "CHANGELOG.md",
      "# Changelog\n\n## Unreleased\n\n- Define each release entry before the release PR is merged.\n\n## v0.3.0 - 2026-06-06\n\n- Added version governance.\n"
    );
    commitAll(cwd, "feature");

    const result = runPolicy(cwd, "feature/task-313-version-governance");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Product version policy check passed.");
  });

  test("rejects feature branches with a patch bump", () => {
    const cwd = createRepo();
    repos.push(cwd);
    git(cwd, ["checkout", "-b", "feature/task-313-version-governance"]);
    writePackageFiles(cwd, "0.2.1");
    writeText(cwd, "app/page.tsx", "export default function Page() { return null; }\n");
    writeText(
      cwd,
      "CHANGELOG.md",
      "# Changelog\n\n## Unreleased\n\n- Define each release entry before the release PR is merged.\n\n## v0.2.1 - 2026-06-06\n\n- Added version governance.\n"
    );
    commitAll(cwd, "feature");

    const result = runPolicy(cwd, "feature/task-313-version-governance");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("expected 0.3.0, received 0.2.1");
  });

  test("rejects release-impacting fix branches without a patch bump", () => {
    const cwd = createRepo();
    repos.push(cwd);
    git(cwd, ["checkout", "-b", "fix/task-modal-bug"]);
    writeText(cwd, "lib/task-modal.ts", "export const fixed = true;\n");
    commitAll(cwd, "fix");

    const result = runPolicy(cwd, "fix/task-modal-bug");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("must include a product version bump");
  });

  test("rejects version bumps without a matching changelog entry", () => {
    const cwd = createRepo();
    repos.push(cwd);
    git(cwd, ["checkout", "-b", "fix/task-modal-bug"]);
    writePackageFiles(cwd, "0.2.1");
    writeText(cwd, "lib/task-modal.ts", "export const fixed = true;\n");
    commitAll(cwd, "fix");

    const result = runPolicy(cwd, "fix/task-modal-bug");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Version bumps must update CHANGELOG.md");
  });

  test("allows docs branches without a product version bump", () => {
    const cwd = createRepo();
    repos.push(cwd);
    git(cwd, ["checkout", "-b", "docs/task-313-brief"]);
    writeText(cwd, "docs/versioning.md", "Versioning note.\n");
    commitAll(cwd, "docs");

    const result = runPolicy(cwd, "docs/task-313-brief");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("No production-bound version bump required");
  });
});
