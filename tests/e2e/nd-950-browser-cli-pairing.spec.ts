import { expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { signInAsVerifiedUser } from "./helpers/auth-helpers";

function spawnCrossPlatform(
  command: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv; timeout?: number },
  callback: (error: Error | null, stdout: string, stderr: string) => void
) {
  if (process.platform === "win32" && /\.(cmd|bat)$/i.test(command)) {
    return execFile(
      "cmd.exe",
      ["/d", "/s", "/c", command, ...args],
      { ...options, windowsHide: true },
      callback
    );
  }
  return execFile(
    command,
    args,
    { ...options, windowsHide: true },
    callback
  );
}

test(
  "standalone nd installations approve in browser, share one persistent actor across two installations, isolate profiles, and revoke independently",
  async ({ page }, testInfo) => {
    test.skip(
      process.platform !== "win32" && process.env.ND_NATIVE_VAULT_TEST !== "1",
      "Needs unlocked native OS vault; covered on Windows DPAPI and the Native Agent Identity workflow"
    );
    test.setTimeout(180_000);

    const base = String(testInfo.project.use.baseURL);
    await signInAsVerifiedUser(page);

    const createdProject = await page.request.post("/api/projects", {
      data: { name: `ND950 Browser CLI ${Date.now()}` },
    });
    expect(createdProject.status()).toBe(201);
    const { project } = await createdProject.json();
    const projectApi = `/api/projects/${project.id}`;

    const manageIdentity = async (command: Record<string, unknown>) => {
      const response = await page.request.post(
        `${projectApi}/agent-identities`,
        { data: command }
      );
      expect(response.ok(), await response.text()).toBeTruthy();
      return response.json();
    };

    const oscar = await manageIdentity({
      operation: "create",
      name: "Oscar",
      descriptiveLabels: ["Orchestrator"],
      scopes: ["project:read", "task:read", "task:write"],
      canMoveTasksToDone: true,
    });
    const nova = await manageIdentity({
      operation: "create",
      name: "Nova",
      descriptiveLabels: ["Reviewer"],
      scopes: ["task:read", "task:write"],
      canMoveTasksToDone: false,
    });

    const createdTask = await page.request.post(`${projectApi}/tasks`, {
      data: {
        title: "ND950 browser-paired task target",
        description: "Verify standalone nd task search and comment attribution.",
      },
    });
    expect(createdTask.status()).toBe(201);
    const { task } = await createdTask.json();

    // Simulate two independent machines/installations completely outside the repository checkout.
    const sandboxRoot = await mkdtemp(join(tmpdir(), "nd950-e2e-"));
    try {
      const installPrefix = join(sandboxRoot, "npm-global");
      const homeLaptopA = join(sandboxRoot, "home-laptop-a");
      const homeLaptopB = join(sandboxRoot, "home-laptop-b");
      const emptyCwdA = join(sandboxRoot, "workspace-a");
      const emptyCwdB = join(sandboxRoot, "workspace-b");
      await Promise.all([
        mkdtemp(join(sandboxRoot, "init-")),
        rm(emptyCwdA, { force: true }).then(() => mkdtemp(join(sandboxRoot, "ws-a-"))),
      ]);
      const actualCwdA = await mkdtemp(join(sandboxRoot, "cwd-a-"));
      const actualCwdB = await mkdtemp(join(sandboxRoot, "cwd-b-"));

      const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
      await new Promise<void>((resolveInstall, rejectInstall) => {
        spawnCrossPlatform(
          npmCmd,
          ["install", "--global", "--prefix", installPrefix, `${base}/api/cli/nd.tgz`],
          { cwd: actualCwdA, timeout: 60_000 },
          (err, _out, stderr) =>
            err ? rejectInstall(new Error(stderr || err.message)) : resolveInstall()
        );
      });

      const ndBin =
        process.platform === "win32"
          ? join(installPrefix, "nd.cmd")
          : join(installPrefix, "bin", "nd");

      const cleanClientEnv = (ndHome: string, extraEnv: Record<string, string> = {}) => {
        const env: Record<string, string> = {};
        for (const [key, value] of Object.entries(process.env)) {
          if (value === undefined) continue;
          if (/^ND_AGENT_|^ND_PROFILE$|^ND_HOME$|^NEXUSDASH_/i.test(key)) continue;
          env[key] = value;
        }
        env.ND_HOME = ndHome;
        env.ND_NO_BROWSER = "1";
        return { ...env, ...extraEnv };
      };

      const runNd = (
        ndHome: string,
        cwd: string,
        args: string[],
        extraEnv: Record<string, string> = {}
      ) =>
        new Promise<{ code: number; stdout: string; stderr: string }>((accept) => {
          spawnCrossPlatform(
            ndBin,
            args,
            {
              cwd,
              env: cleanClientEnv(ndHome, extraEnv),
              timeout: 60_000,
            },
            (error, stdout, stderr) =>
              accept({
                code: error ? Number((error as NodeJS.ErrnoException).code) || 1 : 0,
                stdout,
                stderr,
              })
          );
        });

      const approveLoginInBrowser = async (
        ndHome: string,
        cwd: string,
        deviceLabel: string,
        identityRadioValue: string,
        profileArgs: string[] = []
      ) => {
        let output = "";
        let resolveUrl!: (url: string) => void;
        const urlReady = new Promise<string>((resolve) => {
          resolveUrl = resolve;
        });

        const childPromise = new Promise<{ code: number; stdout: string; stderr: string }>(
          (accept) => {
            const child = spawnCrossPlatform(
              ndBin,
              [
                "login",
                "--base",
                base,
                "--name",
                deviceLabel,
                "--no-browser",
                ...profileArgs,
              ],
              {
                cwd,
                env: cleanClientEnv(ndHome),
                timeout: 60_000,
              },
              (error, stdout, stderr) =>
                accept({
                  code: error ? Number((error as NodeJS.ErrnoException).code) || 1 : 0,
                  stdout,
                  stderr,
                })
            );
            child.stdout?.on("data", (chunk) => {
              output += String(chunk);
              const match = /Approve in browser:\s*(https?:\/\/\S+)/.exec(output);
              if (match?.[1]) {
                resolveUrl(match[1]);
              }
            });
          }
        );

        const authorizeUrl = await urlReady;
        await page.goto(authorizeUrl);
        await expect(
          page.getByRole("heading", { name: "Approve CLI installation" })
        ).toBeVisible();

        await page
          .getByRole("combobox", { name: "Project", exact: true })
          .selectOption(project.id);
        await page
          .locator(`input[type="radio"][value="${identityRadioValue}"]`)
          .check();

        // Check mobile 390px and desktop 1440px overflow discipline on the approval surface.
        await page.setViewportSize({ width: 390, height: 844 });
        const mobileOverflow = await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth
        );
        expect(mobileOverflow).toBe(false);
        await page.setViewportSize({ width: 1280, height: 800 });

        await page.getByRole("button", { name: /^Approve .+ for this CLI$/ }).click();
        await expect(
          page.getByRole("heading", { name: "CLI installation approved" })
        ).toBeVisible();
        await expect(page.locator("main")).toContainText(deviceLabel);

        const finished = await childPromise;
        expect(finished.code, finished.stdout + finished.stderr).toBe(0);
        expect(finished.stdout + finished.stderr).not.toMatch(
          /accessToken|runtimeCredential|pollSecret/i
        );
      };

      // Pair Laptop A (default profile -> Oscar) and Laptop B (default profile -> same Oscar).
      await approveLoginInBrowser(
        homeLaptopA,
        actualCwdA,
        "Laptop A (nd)",
        oscar.identityId
      );
      await approveLoginInBrowser(
        homeLaptopB,
        actualCwdB,
        "Laptop B (nd)",
        oscar.identityId
      );

      // Pair a second profile "nova" on Laptop A to verify profile-granularity concurrency isolation.
      await approveLoginInBrowser(
        homeLaptopA,
        actualCwdA,
        "Laptop A Nova (nd)",
        nova.identityId,
        ["--profile", "nova"]
      );

      // Verify credentials are stored outside the repository and profile JSON holds zero secrets.
      expect(await readdir(actualCwdA)).toEqual([]);
      const profileRaw = await readFile(
        join(homeLaptopA, "cli", "profiles", "default.json"),
        "utf8"
      );
      expect(profileRaw).not.toMatch(/Secret|Token|Bearer/i);

      // Both installations search and comment using plain task commands with zero session/broker args.
      const searchA = await runNd(homeLaptopA, actualCwdA, [
        "tasks",
        "search",
        task.reference,
      ]);
      expect(searchA.code, searchA.stderr).toBe(0);
      expect(searchA.stdout).toContain("ND950 browser-paired task target");

      const commentA = await runNd(homeLaptopA, actualCwdA, [
        "task",
        "comment",
        task.reference,
        "Contribution from Laptop A without session ceremony",
        "--json",
      ]);
      expect(commentA.code, commentA.stderr).toBe(0);

      const commentB = await runNd(homeLaptopB, actualCwdB, [
        "task",
        "comment",
        task.reference,
        "Contribution from Laptop B reusing Oscar",
        "--json",
      ]);
      expect(commentB.code, commentB.stderr).toBe(0);

      // Concurrent Nova profile acts as Nova, cannot move to Done, and never changes default Oscar actor.
      const novaDoneDenied = await runNd(
        homeLaptopA,
        actualCwdA,
        ["task", "status", task.reference, "Done"],
        { ND_PROFILE: "nova" }
      );
      expect(novaDoneDenied.code).toBe(1);
      expect(novaDoneDenied.stderr).toContain("Permission denied");

      const commentNova = await runNd(
        homeLaptopA,
        actualCwdA,
        ["task", "comment", task.reference, "Review note from Nova", "--json"],
        { ND_PROFILE: "nova" }
      );
      expect(commentNova.code, commentNova.stderr).toBe(0);

      const commentAAgain = await runNd(homeLaptopA, actualCwdA, [
        "task",
        "comment",
        task.reference,
        "Second note from Laptop A still Oscar",
        "--json",
      ]);
      expect(commentAAgain.code, commentAAgain.stderr).toBe(0);

      const parsedA = JSON.parse(commentA.stdout);
      const parsedB = JSON.parse(commentB.stdout);
      const parsedNova = JSON.parse(commentNova.stdout);
      const parsedAAgain = JSON.parse(commentAAgain.stdout);
      expect(parsedA.comment.author.id).toBe(oscar.identityId);
      expect(parsedB.comment.author.id).toBe(oscar.identityId);
      expect(parsedAAgain.comment.author.id).toBe(oscar.identityId);
      expect(parsedNova.comment.author.id).toBe(nova.identityId);

      // Revoke Laptop A's installation grant in Project Settings -> Agent access API/UI.
      const identitiesSnapshot = await (
        await page.request.get(`${projectApi}/agent-identities`)
      ).json();
      const oscarRecord = identitiesSnapshot.identities.find(
        (entry: { id: string }) => entry.id === oscar.identityId
      );
      const laptopADevice = oscarRecord.devices.find(
        (entry: { name: string }) => entry.name === "Laptop A (nd)"
      );
      expect(laptopADevice).toBeDefined();

      await manageIdentity({
        operation: "revoke-device",
        identityId: oscar.identityId,
        deviceId: laptopADevice.id,
      });

      // Laptop A is immediately blocked with actionable reconnect instructions.
      const blockedA = await runNd(homeLaptopA, actualCwdA, [
        "tasks",
        "search",
        task.reference,
      ]);
      expect(blockedA.code).toBe(1);
      expect(blockedA.stderr.toLowerCase()).toContain('run "nd login"');
      expect(blockedA.stderr).not.toMatch(/accessToken|runtimeCredential/i);

      // Laptop B continues working uninterrupted as Oscar!
      const stillWorkingB = await runNd(homeLaptopB, actualCwdB, [
        "task",
        "comment",
        task.reference,
        "Laptop B still active after Laptop A revocation",
        "--json",
      ]);
      expect(stillWorkingB.code, stillWorkingB.stderr).toBe(0);
      expect(JSON.parse(stillWorkingB.stdout).comment.author.id).toBe(
        oscar.identityId
      );
    } finally {
      await rm(sandboxRoot, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 250,
      }).catch(() => {});
    }
  }
);
