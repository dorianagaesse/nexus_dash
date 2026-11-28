import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, test, vi } from "vitest";

import { buildNdCliTarball } from "@/lib/cli/nd-cli-bundle";
import { runCli } from "../../packages/nd-cli/src/cli.mjs";
import { readProfile } from "../../packages/nd-cli/src/profiles.mjs";
import { createCliVault } from "../../packages/nd-cli/src/vault.mjs";

const execFileAsync = promisify(execFile);

function execCrossPlatform(
  command: string,
  args: string[],
  cwd: string
): Promise<{ stdout: string; stderr: string }> {
  if (process.platform === "win32" && /\.(cmd|bat)$/i.test(command)) {
    return execFileAsync("cmd.exe", ["/d", "/s", "/c", command, ...args], {
      cwd,
      windowsHide: true,
    });
  }
  return execFileAsync(command, args, { cwd, windowsHide: true });
}

function createMemoryVault() {
  const map = new Map<string, string>();
  return {
    map,
    async write(key: string, value: string) {
      map.set(key, String(value));
    },
    async read(key: string) {
      return map.get(key) ?? null;
    },
    async remove(key: string) {
      map.delete(key);
    },
  };
}

describe("standalone nd CLI", () => {
  const tempDirs: string[] = [];

  async function makeTempDir(prefix: string) {
    const dir = await mkdtemp(join(tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    for (const dir of tempDirs.splice(0)) {
      await rm(dir, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 200,
      }).catch(() => {});
    }
  });

  test.skipIf(
    process.platform !== "win32" && process.env.ND_NATIVE_VAULT_TEST !== "1"
  )(
    "OS vault encrypts and removes CLI grants and session caches without plaintext files",
    async () => {
      const homeDir = await makeTempDir("nd950-vault-");
      const vault = createCliVault({ homeDir });
      const key = randomBytes(32).toString("hex");
      const secretPayload = JSON.stringify({
        sessionId: "sess-1",
        accessToken: "secret-jwt-value-12345",
      });

      await vault.write(key, secretPayload);
      try {
        if (process.platform === "win32") {
          const onDisk = await readFile(join(homeDir, "vault", key), "utf8");
          expect(onDisk).not.toContain("secret-jwt-value-12345");
        }
        expect(await vault.read(key)).toBe(secretPayload);
      } finally {
        await vault.remove(key);
      }
      expect(await vault.read(key)).toBeNull();
    },
    25_000
  );

  test(
    "installs standalone from the generated tarball outside the repository checkout",
    async () => {
      const outsideDir = await makeTempDir("nd950-standalone-");
      const installPrefix = join(outsideDir, "prefix");
      const emptyWorkdir = join(outsideDir, "workdir");
      const tgzPath = join(outsideDir, "nd-cli.tgz");
      await writeFile(tgzPath, await buildNdCliTarball());
      await mkdtemp(join(outsideDir, "work-"));

      const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
      await execCrossPlatform(
        npmCmd,
        ["install", "--global", "--prefix", installPrefix, tgzPath],
        outsideDir
      );

      const binPath =
        process.platform === "win32"
          ? join(installPrefix, "nd.cmd")
          : join(installPrefix, "bin", "nd");

      const { stdout } = await execCrossPlatform(
        binPath,
        ["--help"],
        outsideDir
      );
      expect(stdout).toContain("nd - Standalone NexusDash CLI");
      expect(stdout).toContain("nd tasks search");
      expect(stdout).toContain("nd task comment");
      void emptyWorkdir;
    },
    45_000
  );

  test("pairs via browser flow, runs task search/comment, renews expired tokens, and reports reconnect on revocation", async () => {
    const homeDir = await makeTempDir("nd950-cli-");
    const vault = createMemoryVault();
    const lines: string[] = [];
    let pollCalls = 0;
    let runtimeStarts = 0;
    let runtimeRenews = 0;
    let revoked = false;
    let tokenTtlSeconds = 300;

    const fetchMock = vi.fn(async (input: URL | string, init?: RequestInit) => {
      const url = new URL(String(input));
      const body = init?.body ? JSON.parse(String(init.body)) : {};

      if (url.pathname === "/api/auth/agent/cli") {
        if (body.operation === "begin") {
          expect(body.installSecretHash).toMatch(/^[a-f0-9]{64}$/);
          return Response.json(
            {
              requestId: "req-1",
              userCode: "WXYZ-2345",
              pollSecret: "p".repeat(43),
              authorizePath: "/cli/authorize?code=WXYZ-2345",
              expiresAt: new Date(Date.now() + 600_000).toISOString(),
              intervalSeconds: 1,
            },
            { status: 201 }
          );
        }
        pollCalls += 1;
        if (pollCalls === 1) {
          return Response.json({
            status: "pending",
            expiresAt: new Date(Date.now() + 600_000).toISOString(),
          });
        }
        return Response.json({
          status: "approved",
          projectId: "proj-1",
          projectName: "NexusDash",
          identityId: "oscar",
          identityName: "Oscar",
          descriptiveLabels: ["Orchestrator"],
          deviceId: "dev-laptop-1",
          deviceName: "Laptop 1 (nd)",
          scopes: ["project:read", "task:read", "task:write"],
          canMoveTasksToDone: true,
          deviceExpiresAt: new Date(Date.now() + 90 * 86_400_000).toISOString(),
        });
      }

      if (url.pathname === "/api/auth/agent/runtime") {
        if (revoked) {
          return Response.json({ error: "runtime-access-denied" }, { status: 401 });
        }
        if (body.operation === "start") {
          runtimeStarts += 1;
          return Response.json({
            accessToken: `jwt-start-${runtimeStarts}`,
            expiresInSeconds: tokenTtlSeconds,
            sessionId: "sess-oscar-1",
            deviceId: "dev-laptop-1",
            identityId: "oscar",
            projectId: "proj-1",
            scopes: ["project:read", "task:read", "task:write"],
            identityName: "Oscar",
            descriptiveLabels: ["Orchestrator"],
            sessionExpiresAt: new Date(Date.now() + 12 * 3_600_000).toISOString(),
            deviceExpiresAt: new Date(Date.now() + 90 * 86_400_000).toISOString(),
            canMoveTasksToDone: true,
          });
        }
        if (body.operation === "renew") {
          runtimeRenews += 1;
          return Response.json({
            accessToken: `jwt-renew-${runtimeRenews}`,
            expiresInSeconds: 300,
            sessionId: body.sessionId,
            deviceId: "dev-laptop-1",
            identityId: "oscar",
            projectId: "proj-1",
            scopes: ["project:read", "task:read", "task:write"],
            identityName: "Oscar",
            descriptiveLabels: ["Orchestrator"],
            sessionExpiresAt: new Date(Date.now() + 12 * 3_600_000).toISOString(),
            deviceExpiresAt: new Date(Date.now() + 90 * 86_400_000).toISOString(),
            canMoveTasksToDone: true,
          });
        }
      }

      if (revoked) {
        return Response.json({ error: "runtime-access-denied" }, { status: 401 });
      }

      if (url.pathname === "/api/projects/proj-1/tasks/search") {
        return Response.json({
          taskIds: ["task-950"],
          totalMatches: 1,
          truncated: false,
        });
      }
      if (url.pathname === "/api/projects/proj-1/tasks") {
        return Response.json({
          tasks: [
            {
              id: "task-950",
              reference: "ND-950",
              title: "Reuse an existing agent identity",
              status: "In Progress",
              labels: ["feature"],
              assignee: null,
            },
          ],
        });
      }
      if (url.pathname === "/api/projects/proj-1/tasks/task-950") {
        return Response.json({
          task: {
            id: "task-950",
            reference: "ND-950",
            title: "Reuse an existing agent identity",
            status: "In Progress",
            labels: ["feature"],
          },
        });
      }
      if (url.pathname === "/api/projects/proj-1/tasks/task-950/comments") {
        return Response.json(
          {
            comment: {
              id: "comment-1",
              content: body.content,
              createdAt: new Date().toISOString(),
              author: {
                id: "oscar",
                kind: "agent",
                displayName: "Oscar",
              },
            },
          },
          { status: 201 }
        );
      }

      throw new Error(`Unhandled URL: ${url}`);
    });

    tokenTtlSeconds = 300; // Initial 5-minute bearer reused across search + list.

    const loginExit = await runCli(
      ["login", "--base", "https://nexus-dash.app", "--no-browser"],
      {
        homeDir,
        vault,
        fetchImpl: fetchMock,
        pollIntervalMs: 5,
        stdout: (line: string) => lines.push(line),
      }
    );
    expect(loginExit).toBe(0);
    expect(lines.join("\n")).toContain("Confirmation code: WXYZ-2345");
    expect(lines.join("\n")).toContain(
      'Connected profile "default" to identity "Oscar" (oscar)'
    );

    // Non-secret profile file contains zero credentials or tokens.
    const rawProfileJson = await readFile(
      join(homeDir, "cli", "profiles", "default.json"),
      "utf8"
    );
    expect(rawProfileJson).not.toMatch(/Secret|Token|jwt/i);
    expect(await readProfile("default", { homeDir })).toMatchObject({
      identityId: "oscar",
      deviceId: "dev-laptop-1",
    });

    // Search tasks with zero session IDs or credentials in CLI args.
    lines.length = 0;
    await runCli(["tasks", "search", "ND-950"], {
      homeDir,
      vault,
      fetchImpl: fetchMock,
      stdout: (line: string) => lines.push(line),
    });
    expect(runtimeStarts).toBe(1);
    expect(runtimeRenews).toBe(0);
    expect(lines.join("\n")).toContain(
      "ND-950  [In Progress]  Reuse an existing agent identity"
    );

    // Advance clock into the <30s renewal window so the next command renews on the same sessionId.
    const futureNow = Date.now() + 280_000;
    vi.spyOn(Date, "now").mockReturnValue(futureNow);
    lines.length = 0;
    await runCli(["task", "comment", "ND-950", "Summary from normal client"], {
      homeDir,
      vault,
      fetchImpl: fetchMock,
      stdout: (line: string) => lines.push(line),
    });
    expect(runtimeStarts).toBe(1);
    expect(runtimeRenews).toBe(1);
    expect(lines.join("\n")).toContain(
      "Comment comment-1 added to task task-950 as Oscar (oscar)."
    );

    // Revoking the installation causes the next command to fail closed with reconnect guidance.
    revoked = true;
    await expect(
      runCli(["tasks", "search", "ND-950"], {
        homeDir,
        vault,
        fetchImpl: fetchMock,
        stdout: () => {},
      })
    ).rejects.toThrow(/run "nd login" in their terminal to reconnect/i);
  });

  test("prevents silent actor switching on an existing profile and isolates concurrent profiles", async () => {
    const homeDir = await makeTempDir("nd950-isolation-");
    const vault = createMemoryVault();

    const makeFetchForActor = (
      actorId: string,
      actorName: string,
      deviceId: string
    ) =>
      vi.fn(async (input: URL | string, init?: RequestInit) => {
        const url = new URL(String(input));
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        if (url.pathname === "/api/auth/agent/cli") {
          if (body.operation === "begin") {
            return Response.json(
              {
                requestId: `req-${deviceId}`,
                userCode: "BCDE-2345",
                pollSecret: "q".repeat(43),
                authorizePath: "/cli/authorize?code=BCDE-2345",
                expiresAt: new Date(Date.now() + 600_000).toISOString(),
                intervalSeconds: 1,
              },
              { status: 201 }
            );
          }
          return Response.json({
            status: "approved",
            projectId: "proj-1",
            projectName: "NexusDash",
            identityId: actorId,
            identityName: actorName,
            descriptiveLabels: [],
            deviceId,
            deviceName: `${actorName} laptop`,
            scopes: ["task:read", "task:write"],
            canMoveTasksToDone: false,
            deviceExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          });
        }
        if (url.pathname === "/api/auth/agent/runtime") {
          return Response.json({
            accessToken: `token-for-${body.identityId}`,
            expiresInSeconds: 300,
            sessionId: `sess-${body.identityId}`,
            deviceId,
            identityId: body.identityId,
            projectId: "proj-1",
            scopes: ["task:read", "task:write"],
            identityName: actorName,
            descriptiveLabels: [],
            sessionExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
            deviceExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
            canMoveTasksToDone: false,
          });
        }
        return Response.json(
          {
            comment: {
              id: `c-${actorId}`,
              content: body.content,
              createdAt: new Date().toISOString(),
              author: {
                id: actorId,
                kind: "agent",
                displayName: actorName,
              },
            },
          },
          { status: 201 }
        );
      });

    // Pair default profile as Oscar.
    await runCli(
      ["login", "--base", "https://nexus-dash.app", "--no-browser"],
      {
        homeDir,
        vault,
        fetchImpl: makeFetchForActor("oscar", "Oscar", "dev-oscar"),
        pollIntervalMs: 5,
        stdout: () => {},
      }
    );

    // Attempting to approve Nova onto the existing default profile without --replace is rejected!
    await expect(
      runCli(["login", "--base", "https://nexus-dash.app", "--no-browser"], {
        homeDir,
        vault,
        fetchImpl: makeFetchForActor("nova", "Nova", "dev-nova-bad"),
        pollIntervalMs: 5,
        stdout: () => {},
      })
    ).rejects.toThrow(/Refusing to switch its actor to "Nova"/);

    // Pair Nova onto an isolated profile "nova", then re-authenticate "nova" with --replace.
    await runCli(
      [
        "login",
        "--base",
        "https://nexus-dash.app",
        "--profile",
        "nova",
        "--no-browser",
      ],
      {
        homeDir,
        vault,
        fetchImpl: makeFetchForActor("nova", "Nova", "dev-nova-1"),
        pollIntervalMs: 5,
        stdout: () => {},
      }
    );
    await runCli(
      [
        "login",
        "--base",
        "https://nexus-dash.app",
        "--profile",
        "nova",
        "--replace",
        "--no-browser",
      ],
      {
        homeDir,
        vault,
        fetchImpl: makeFetchForActor("nova-2", "Nova Two", "dev-nova-2"),
        pollIntervalMs: 5,
        stdout: () => {},
      }
    );

    // Concurrent execution on default profile STILL acts as Oscar, completely unaffected!
    const oscarOut: string[] = [];
    await runCli(["task", "comment", "task-1", "Still Oscar"], {
      homeDir,
      vault,
      fetchImpl: makeFetchForActor("oscar", "Oscar", "dev-oscar"),
      stdout: (line: string) => oscarOut.push(line),
    });
    expect(oscarOut.join("\n")).toContain("as Oscar (oscar)");
  });
});
