import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import {
  cleanupRepos,
  createRepo,
  runNodeScript,
  writeJson,
} from "./support/version-test-support";

function readJson(path: string) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readVersions(cwd: string) {
  const packageJson = readJson(join(cwd, "package.json"));
  const packageLock = readJson(join(cwd, "package-lock.json"));

  return {
    packageJson: packageJson.version as string,
    lock: packageLock.version as string,
    lockRoot: packageLock.packages[""].version as string,
  };
}

function runReleaseVersion(cwd: string, args: string[]) {
  return runNodeScript(cwd, "release-version.mjs", args);
}

// Spawn-heavy sync tests (npm version): raise the timeout above the 5s default so parallel workers or a loaded CI machine cannot flake them.
describe("release version helper", { timeout: 30_000 }, () => {
  const repos: string[] = [];

  afterEach(() => {
    cleanupRepos(repos);
  });

  test("bumps minor and resets patch", () => {
    const cwd = createRepo("0.73.5");
    repos.push(cwd);

    const result = runReleaseVersion(cwd, ["minor"]);

    expect(result.status).toBe(0);
    expect(readVersions(cwd)).toEqual({
      packageJson: "0.74.0",
      lock: "0.74.0",
      lockRoot: "0.74.0",
    });
    expect(result.stdout).toContain("chore/release-v0.74.0");
    expect(result.stdout).toContain("Tag to create after merge: v0.74.0");
  });

  test("bumps patch for a fix-only release", () => {
    const cwd = createRepo("0.73.0");
    repos.push(cwd);

    const result = runReleaseVersion(cwd, ["patch"]);

    expect(result.status).toBe(0);
    expect(readVersions(cwd)).toEqual({
      packageJson: "0.73.1",
      lock: "0.73.1",
      lockRoot: "0.73.1",
    });
  });

  test("bumps major for the 1.0 baseline", () => {
    const cwd = createRepo("0.73.0");
    repos.push(cwd);

    const result = runReleaseVersion(cwd, ["major"]);

    expect(result.status).toBe(0);
    expect(readVersions(cwd)).toEqual({
      packageJson: "1.0.0",
      lock: "1.0.0",
      lockRoot: "1.0.0",
    });
  });

  test("accepts an explicit target version", () => {
    const cwd = createRepo("0.73.0");
    repos.push(cwd);

    const result = runReleaseVersion(cwd, ["0.75.2"]);

    expect(result.status).toBe(0);
    expect(readVersions(cwd).packageJson).toBe("0.75.2");
  });

  test("dry runs leave the package files unchanged", () => {
    const cwd = createRepo("0.73.0");
    repos.push(cwd);

    const result = runReleaseVersion(cwd, ["minor", "--dry-run"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Dry run only");
    expect(readVersions(cwd).packageJson).toBe("0.73.0");
  });

  test("rejects branch-type aliases from the per-PR bump workflow", () => {
    const cwd = createRepo("0.73.0");
    repos.push(cwd);

    const result = runReleaseVersion(cwd, ["feature"]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Expected minor, patch, major, or an explicit x.y.z version");
  });

  test("rejects targets that are not greater than the current version", () => {
    const cwd = createRepo("0.73.0");
    repos.push(cwd);

    const result = runReleaseVersion(cwd, ["0.73.0"]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("must be greater than current version 0.73.0");
  });

  test("rejects package and lockfile version drift", () => {
    const cwd = createRepo("0.73.0");
    repos.push(cwd);
    const lockPath = join(cwd, "package-lock.json");
    const lock = readJson(lockPath);
    lock.version = "0.73.1";
    lock.packages[""].version = "0.73.1";
    writeJson(lockPath, lock);

    const result = runReleaseVersion(cwd, ["minor"]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("package.json and package-lock.json versions must match");
  });
});
