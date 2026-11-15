import { expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { LocalBroker } from "../../scripts/agent-runtime/local-broker.mjs";
import { createVault } from "../../scripts/agent-runtime/vault.mjs";
import { pairDevice } from "../../scripts/agent-runtime/client.mjs";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import { runOrdinaryClientSmoke } from "./helpers/agent-client-smoke";

// Native stores require an unlocked desktop vault. The dedicated native job
// enables this on Linux/macOS; Windows runs it with the signed-in user's DPAPI.
test("independent CLI processes select and retain runtime identities through the native vault", async ({ page }, testInfo) => {
  test.skip(process.platform !== "win32" && process.env.ND_NATIVE_VAULT_TEST !== "1", "Needs native unlocked OS vault; run the native identity workflow");
  test.setTimeout(process.env.ND_LONG_RUNTIME_TEST === "1" || process.env.ND_ACTUAL_CLIENT_TEST === "1" ? 720_000 : 180_000);
  await signInAsVerifiedUser(page);
  const created = await page.request.post("/api/projects", { data: { name: `ND658 ordinary clients ${Date.now()}` } });
  expect(created.status()).toBe(201);
  const { project } = await created.json();
  const root = `/api/projects/${project.id}`;
  const base = String(testInfo.project.use.baseURL);
  const scopes = ["task:read", "task:write"];
  const manage = async (command: Record<string, unknown>) => {
    const response = await page.request.post(`${root}/agent-identities`, { data: command });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  };
  const oscar = await manage({ operation: "create", name: "Oscar", descriptiveLabels: ["Orchestrator"], scopes, canMoveTasksToDone: true });
  const nova = await manage({ operation: "create", name: "Nova", scopes, canMoveTasksToDone: false });
  const vault = createVault();
  const directory = await mkdtemp(join(tmpdir(), "nd658-native-"));
  const binding = (identityId: string) => ({ base, projectId: project.id, identityId });
  for (const identity of [oscar, nova]) {
    const authorization = await manage({ operation: "authorize-device", identityId: identity.identityId,
      name: `Native ${process.platform}`, scopes, canMoveTasksToDone: identity === oscar });
    await pairDevice(binding(identity.identityId), authorization.pairingCode, vault);
  }
  const broker = await new LocalBroker(directory, vault).start();
  // No wrapper, inherited ND variables or persistent shell. Every command below
  // is a fresh Node process, identical to a terminal tool in an existing client.
  const cli = async (command: string, args: string[], expectedCode = 0) => {
    const env = { ...process.env };
    for (const name of Object.keys(env)) if (/^ND_AGENT_|^NEXUSDASH_.*(?:KEY|TOKEN)/i.test(name)) delete env[name];
    const result = await new Promise<{ code: number; stdout: string; stderr: string }>((accept) => {
      execFile(process.execPath, [resolve("scripts/nd-agent.mjs"), "session", command, "--broker", directory, ...args],
        { env, windowsHide: true, timeout: 60_000 }, (error, stdout, stderr) => accept({ code: error ? Number(error.code) || 1 : 0, stdout, stderr }));
    });
    expect(result.stderr).not.toMatch(/nd_agent_|accessToken|runtimeCredential|pairingCode/);
    expect(result.code, result.stdout + result.stderr).toBe(expectedCode);
    return result.stdout.trim() ? JSON.parse(result.stdout) : null;
  };
  const open = (identityId: string, client: string) => cli("open", ["--base", base, "--project", project.id, "--identity", identityId, "--client", client]);
  let fileNumber = 0;
  const request = async (sessionId: string, method: string, path: string, body?: unknown, expectedCode = 0) => {
    const args = ["--session", sessionId, "--method", method, "--path", path];
    if (body) {
      const file = join(directory, `body-${++fileNumber}.json`);
      await writeFile(file, JSON.stringify(body));
      args.push("--body-file", file);
    }
    return cli("request", args, expectedCode);
  };
  try {
    const a = await open(oscar.identityId, "Codex CLI / conversation A");
    const b = await open(oscar.identityId, "Codex VS Code / conversation B");
    const n = await open(nova.identityId, "Claude Code / DeepSeek conversation C");
    expect(new Set([a.sessionId, b.sessionId, n.sessionId]).size).toBe(3);
    expect(a.identityId).toBe(b.identityId);
    expect(a.canMoveTasksToDone).toBe(true);
    expect(n.canMoveTasksToDone).toBe(false);
    expect(JSON.stringify(a)).not.toMatch(/accessToken|runtimeCredential|capability/);
    if (process.env.ND_ACTUAL_CLIENT_TEST === "1") {
      const clients = await runOrdinaryClientSmoke({ directory, base, projectId: project.id, oscarId: oscar.identityId, novaId: nova.identityId });
      await testInfo.attach("actual-client-smoke", { body: JSON.stringify(clients, null, 2), contentType: "application/json" });
      for (const client of clients) {
        expect(client.code, client.output).toBe(0);
        expect(client.output).toMatch(/"passed"\s*:\s*true/);
      }
      const snapshot = await (await page.request.get(`${root}/agent-identities`)).json();
      const clientSessions = snapshot.identities.flatMap((identity: { devices: { sessions: { id: string; client: string }[] }[] }) => identity.devices.flatMap((device) => device.sessions))
        .filter((session: { client: string }) => ["Codex ordinary A", "Codex ordinary B", "Claude Code ordinary C", "Claude Code ordinary D"].includes(session.client));
      expect(new Set(clientSessions.map((session: { id: string }) => session.id)).size).toBe(4);
      const actualTasks = (await (await page.request.get(`${root}/tasks`)).json()).tasks;
      for (const [name, identityId, status] of [["Codex ordinary A", oscar.identityId, "Done"], ["Codex ordinary B", oscar.identityId, "Done"],
        ["Claude Code ordinary C", nova.identityId, "Backlog"], ["Claude Code ordinary D", oscar.identityId, "Done"]]) {
        expect(actualTasks.find((task: { title: string }) => task.title === `${name} updated contribution`)).toMatchObject({ createdBy: { id: identityId }, status });
      }
    }
    if (process.env.ND_LONG_RUNTIME_TEST === "1") {
      // Let the issued five-minute bearer really expire. Request renewal is
      // automatic and must retain the original session, device and actor.
      await new Promise<void>((accept) => setTimeout(accept, 301_000));
      await request(n.sessionId, "GET", `${root}/tasks`);
      expect((await cli("status", ["--session", n.sessionId])).sessionId).toBe(n.sessionId);
    }
    const made = await request(a.sessionId, "POST", `${root}/tasks`, { title: "Normal-start contribution", assignee: { kind: "agent", id: oscar.identityId } });
    const task = made.task;
    expect(task.createdBy.id).toBe(oscar.identityId);
    const search = await request(b.sessionId, "GET", `${root}/tasks/search?q=Normal-start`);
    expect(JSON.stringify(search)).toContain(task.id);
    await request(a.sessionId, "PATCH", `${root}/tasks/${task.id}`, { title: "Updated through another shell invocation" });
    const comment = await request(b.sessionId, "POST", `${root}/tasks/${task.id}/comments`, { content: "Same persistent actor" });
    expect(comment.comment.author.id).toBe(oscar.identityId);
    await request(n.sessionId, "POST", `${root}/tasks/${task.id}/status`, { status: "Done" }, 1);
    await request(a.sessionId, "POST", `${root}/tasks/${task.id}/status`, { status: "Done" });
    await request(a.sessionId, "GET", "/api/projects/wrong/tasks", undefined, 1);
    await cli("status", [], 1);
    await manage({ operation: "update", identityId: oscar.identityId, name: "Oscar renamed", descriptiveLabels: ["Coordinator"], scopes: ["task:read"], canMoveTasksToDone: false });
    const reduced = await cli("status", ["--session", b.sessionId]);
    expect(reduced).toMatchObject({ identityName: "Oscar renamed", scopes: ["task:read"], canMoveTasksToDone: false });
    await request(b.sessionId, "POST", `${root}/tasks`, { title: "Must not write" }, 1);
    await cli("close", ["--session", a.sessionId]);
    await request(a.sessionId, "GET", `${root}/tasks`, undefined, 1);
    await request(b.sessionId, "GET", `${root}/tasks`);
    await manage({ operation: "end-session", identityId: oscar.identityId, sessionId: b.sessionId });
    await cli("status", ["--session", b.sessionId], 1);
    await request(b.sessionId, "GET", `${root}/tasks`, undefined, 1);
    await request(n.sessionId, "GET", `${root}/tasks`);
    // A subsequent permission increase cannot raise Nova's original ceiling.
    await manage({ operation: "update", identityId: nova.identityId, name: "Nova", scopes, canMoveTasksToDone: true });
    expect((await cli("status", ["--session", n.sessionId])).canMoveTasksToDone).toBe(false);
    await manage({ operation: "deactivate", identityId: oscar.identityId });
    const retained = await request(n.sessionId, "GET", `${root}/tasks/${task.id}/comments`);
    expect(retained.comments.find((entry: { id: string }) => entry.id === comment.comment.id).author.id).toBe(oscar.identityId);
    const journal = await readFile(join(directory, "sessions.json"), "utf8");
    expect(journal).not.toMatch(/accessToken|runtimeCredential|capability/);
    await testInfo.attach("native-cli-evidence", { body: JSON.stringify({ platform: process.platform, oscarId: oscar.identityId,
      sessions: [a.sessionId, b.sessionId, n.sessionId], broker: "independent", commandProcesses: "fresh per invocation",
      clientNames: "descriptive test labels; this does not prove real IDE conversations or physical laptops" }, null, 2), contentType: "application/json" });
  } finally {
    await broker.close();
  }
});
