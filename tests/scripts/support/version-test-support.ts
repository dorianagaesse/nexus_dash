import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const SCRIPTS_DIR = join(process.cwd(), "scripts");

export function runCommand(cwd: string, command: string, args: string[]) {
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

export function git(cwd: string, args: string[]) {
  return runCommand(cwd, "git", args);
}

export function writeJson(path: string, value: unknown) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function writePackageFiles(cwd: string, version: string) {
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

export function writeText(cwd: string, path: string, content: string) {
  const fullPath = join(cwd, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content);
}

export function commitAll(cwd: string, message: string) {
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

export const CHANGELOG_PLACEHOLDER = `# Changelog

## Unreleased

- Release entries are composed by the release-preparation PR
  (\`chore/release-vX.Y.Z\`), not by individual product PRs.
`;

export function createRepo(version = "0.73.0") {
  const cwd = mkdtempSync(join(tmpdir(), "nexusdash-version-policy-"));
  git(cwd, ["init", "-b", "main"]);
  writePackageFiles(cwd, version);
  writeText(cwd, "CHANGELOG.md", CHANGELOG_PLACEHOLDER);
  commitAll(cwd, "base");
  return cwd;
}

export function cleanupRepos(repos: string[]) {
  for (const repo of repos.splice(0)) {
    rmSync(repo, { force: true, recursive: true });
  }
}

export function runNodeScript(repo: string, scriptName: string, args: string[]) {
  const env = { ...process.env };
  delete env.VERSION_POLICY_BRANCH_NAME;
  delete env.VERSION_POLICY_BASE_REF;
  delete env.VERSION_POLICY_HEAD_REF;
  delete env.GITHUB_HEAD_REF;
  delete env.PULL_REQUEST_BRANCH_NAME;
  delete env.GITHUB_EVENT_PATH;

  return spawnSync(process.execPath, [join(SCRIPTS_DIR, scriptName), ...args], {
    cwd: repo,
    encoding: "utf8",
    env,
  });
}
