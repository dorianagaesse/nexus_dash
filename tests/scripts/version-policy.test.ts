import { afterEach, describe, expect, test } from "vitest";

import {
  CHANGELOG_PLACEHOLDER,
  cleanupRepos,
  commitAll,
  createRepo,
  git,
  runNodeScript,
  writePackageFiles,
  writeText,
} from "./support/version-test-support";

function runPolicy(cwd: string, branch: string) {
  return runNodeScript(cwd, "check-version-policy.mjs", [
    "--base",
    "main",
    "--branch",
    branch,
  ]);
}

function changelogWithRelease(version: string, body: string) {
  return `${CHANGELOG_PLACEHOLDER}\n## v${version} - 2026-09-14\n\n${body}`;
}

describe("version policy guard", () => {
  const repos: string[] = [];

  afterEach(() => {
    cleanupRepos(repos);
  });

  test("allows feature branches that merge without version changes", () => {
    const cwd = createRepo();
    repos.push(cwd);
    git(cwd, ["checkout", "-b", "feature/task-457-release-boundaries"]);
    writeText(cwd, "app/page.tsx", "export default function Page() { return null; }\n");
    commitAll(cwd, "feature");

    const result = runPolicy(cwd, "feature/task-457-release-boundaries");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("joins the next production release");
    expect(result.stdout).toContain("Version policy check passed.");
  });

  test("rejects version bumps on feature branches", () => {
    const cwd = createRepo();
    repos.push(cwd);
    git(cwd, ["checkout", "-b", "feature/task-457-release-boundaries"]);
    writePackageFiles(cwd, "0.74.0");
    writeText(cwd, "app/page.tsx", "export default function Page() { return null; }\n");
    commitAll(cwd, "feature");

    const result = runPolicy(cwd, "feature/task-457-release-boundaries");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("only allowed on release-preparation branches");
  });

  test("rejects version bumps on fix branches", () => {
    const cwd = createRepo();
    repos.push(cwd);
    git(cwd, ["checkout", "-b", "fix/task-modal-bug"]);
    writePackageFiles(cwd, "0.73.1");
    writeText(cwd, "lib/task-modal.ts", "export const fixed = true;\n");
    commitAll(cwd, "fix");

    const result = runPolicy(cwd, "fix/task-modal-bug");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("only allowed on release-preparation branches");
  });

  test("allows release-preparation branches with a minor release and changelog entry", () => {
    const cwd = createRepo();
    repos.push(cwd);
    git(cwd, ["checkout", "-b", "chore/release-v0.74.0"]);
    writePackageFiles(cwd, "0.74.0");
    writeText(
      cwd,
      "CHANGELOG.md",
      changelogWithRelease("0.74.0", "- Published the cohesive release workflow.\n")
    );
    commitAll(cwd, "release prep");

    const result = runPolicy(cwd, "chore/release-v0.74.0");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("carries version 0.74.0");
    expect(result.stdout).toContain("Version policy check passed.");
  });

  test("allows release-preparation branches with a patch release", () => {
    const cwd = createRepo();
    repos.push(cwd);
    git(cwd, ["checkout", "-b", "chore/release-v0.73.1-fixes"]);
    writePackageFiles(cwd, "0.73.1");
    writeText(
      cwd,
      "CHANGELOG.md",
      changelogWithRelease("0.73.1", "- Fixed the release-boundary regression.\n")
    );
    commitAll(cwd, "release prep");

    const result = runPolicy(cwd, "chore/release-v0.73.1-fixes");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("carries version 0.73.1");
  });

  test("rejects release-preparation branches whose version does not match the branch name", () => {
    const cwd = createRepo();
    repos.push(cwd);
    git(cwd, ["checkout", "-b", "chore/release-v0.75.0"]);
    writePackageFiles(cwd, "0.74.0");
    writeText(
      cwd,
      "CHANGELOG.md",
      changelogWithRelease("0.74.0", "- Released something.\n")
    );
    commitAll(cwd, "release prep");

    const result = runPolicy(cwd, "chore/release-v0.75.0");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("expected 0.75.0, received 0.74.0");
  });

  test("rejects release-preparation branches that do not move the version", () => {
    const cwd = createRepo();
    repos.push(cwd);
    git(cwd, ["checkout", "-b", "chore/release-v0.74.0"]);
    writeText(cwd, "journal.md", "- Prepared the release.\n");
    commitAll(cwd, "release prep");

    const result = runPolicy(cwd, "chore/release-v0.74.0");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("must bump package.json and package-lock.json to 0.74.0");
  });

  test("rejects release versions that main already passed", () => {
    const cwd = createRepo();
    repos.push(cwd);
    git(cwd, ["checkout", "-b", "chore/release-v0.72.9"]);
    writePackageFiles(cwd, "0.72.9");
    writeText(
      cwd,
      "CHANGELOG.md",
      changelogWithRelease("0.72.9", "- Backdated release.\n")
    );
    commitAll(cwd, "release prep");

    const result = runPolicy(cwd, "chore/release-v0.72.9");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("must be greater than the current main version 0.73.0");
  });

  test("rejects release-preparation branches without a changelog entry", () => {
    const cwd = createRepo();
    repos.push(cwd);
    git(cwd, ["checkout", "-b", "chore/release-v0.74.0"]);
    writePackageFiles(cwd, "0.74.0");
    commitAll(cwd, "release prep");

    const result = runPolicy(cwd, "chore/release-v0.74.0");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("must update CHANGELOG.md");
  });

  test("rejects empty changelog release sections", () => {
    const cwd = createRepo();
    repos.push(cwd);
    git(cwd, ["checkout", "-b", "chore/release-v0.74.0"]);
    writePackageFiles(cwd, "0.74.0");
    writeText(cwd, "CHANGELOG.md", `${CHANGELOG_PLACEHOLDER}\n## v0.74.0 - 2026-09-14\n`);
    commitAll(cwd, "release prep");

    const result = runPolicy(cwd, "chore/release-v0.74.0");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("at least one release entry bullet");
  });

  test("rejects changelog edits without the matching version heading", () => {
    const cwd = createRepo();
    repos.push(cwd);
    git(cwd, ["checkout", "-b", "chore/release-v0.74.0"]);
    writePackageFiles(cwd, "0.74.0");
    writeText(
      cwd,
      "CHANGELOG.md",
      `${CHANGELOG_PLACEHOLDER}\n- An entry without its version heading.\n`
    );
    commitAll(cwd, "release prep");

    const result = runPolicy(cwd, "chore/release-v0.74.0");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("must include a ## v0.74.0 section");
  });

  test("rejects product changes inside release-preparation branches", () => {
    const cwd = createRepo();
    repos.push(cwd);
    git(cwd, ["checkout", "-b", "chore/release-v0.74.0"]);
    writePackageFiles(cwd, "0.74.0");
    writeText(
      cwd,
      "CHANGELOG.md",
      changelogWithRelease("0.74.0", "- Release with smuggled changes.\n")
    );
    writeText(cwd, "app/page.tsx", "export default function Page() { return null; }\n");
    commitAll(cwd, "release prep");

    const result = runPolicy(cwd, "chore/release-v0.74.0");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("metadata-only");
    expect(result.stderr).toContain("app/page.tsx");
  });

  test("rejects package and lockfile version drift on any branch", () => {
    const cwd = createRepo();
    repos.push(cwd);
    git(cwd, ["checkout", "-b", "feature/task-457-release-boundaries"]);
    writeText(cwd, "package-lock.json", `${JSON.stringify({
      name: "nexusdash",
      version: "0.73.1",
      lockfileVersion: 3,
      packages: { "": { name: "nexusdash", version: "0.73.1" } },
    }, null, 2)}\n`);
    commitAll(cwd, "drift");

    const result = runPolicy(cwd, "feature/task-457-release-boundaries");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Head package.json and package-lock.json versions must match.");
  });

  test("allows docs branches without version changes", () => {
    const cwd = createRepo();
    repos.push(cwd);
    git(cwd, ["checkout", "-b", "docs/task-457-versioning"]);
    writeText(cwd, "docs/versioning.md", "Versioning note.\n");
    commitAll(cwd, "docs");

    const result = runPolicy(cwd, "docs/task-457-versioning");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Version policy check passed.");
  });

  test("allows dependabot branches with lockfile content changes only", () => {
    const cwd = createRepo();
    repos.push(cwd);
    git(cwd, ["checkout", "-b", "dependabot/npm_and_yarn/example-1.2.3"]);
    writeText(cwd, "package-lock.json", `${JSON.stringify({
      name: "nexusdash",
      version: "0.73.0",
      lockfileVersion: 3,
      packages: { "": { name: "nexusdash", version: "0.73.0" } },
      dependencies: { example: { version: "1.2.3", resolved: "https://example.invalid/example.tgz" } },
    }, null, 2)}\n`);
    commitAll(cwd, "dependency update");

    const result = runPolicy(cwd, "dependabot/npm_and_yarn/example-1.2.3");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Version policy check passed.");
  });
});
