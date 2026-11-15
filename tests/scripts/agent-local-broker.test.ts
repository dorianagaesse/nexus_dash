import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { LocalBroker, brokerCall } from "../../scripts/agent-runtime/local-broker.mjs";
import { bindingKey } from "../../scripts/agent-runtime/client.mjs";
import { sessionCommand } from "../../scripts/agent-runtime/session-cli.mjs";

const realFetch = globalThis.fetch;
const binding = { base: "https://nexus.example", projectId: "project", identityId: "oscar" };
let broker: LocalBroker;
let directory: string;
let sequence: number;
let access: Map<string, { identityId: string; denied?: boolean }>;
let vault: { read: ReturnType<typeof vi.fn>; write: ReturnType<typeof vi.fn> };
let requests: { path: string; authorization?: string; cookie?: string }[];
let runtimeCalls: Record<string, unknown>[];

beforeEach(async () => {
  sequence = 0;
  access = new Map();
  requests = [];
  runtimeCalls = [];
  const values = new Map([[bindingKey(binding), "a".repeat(43)], [bindingKey({ ...binding, identityId: "nova" }), "b".repeat(43)]]);
  vault = {
    read: vi.fn(async (key) => { if (!values.has(key)) throw new Error("Missing exact binding"); return values.get(key); }),
    write: vi.fn(async (key, value) => { values.set(key, value); }),
  };
  directory = await mkdtemp(join(tmpdir(), "nd-broker-test-"));
  vi.stubGlobal("fetch", vi.fn(async (url, options) => {
    if (new URL(String(url)).hostname === "127.0.0.1") return realFetch(url, options);
    const path = new URL(String(url)).pathname;
    if (path.endsWith("/runtime")) {
      const body = JSON.parse(options.body);
      runtimeCalls.push(body);
      if (body.operation === "end") { access.delete(body.sessionId); return Response.json({ ended: true }); }
      const id = body.sessionId ?? `session-${++sequence}`;
      if (body.operation === "start") access.set(id, { identityId: body.identityId });
      if (!access.has(id) || access.get(id)?.denied) return Response.json({ error: "revoked" }, { status: 401 });
      return Response.json({
        sessionId: id, deviceId: "laptop", identityId: body.identityId, projectId: body.projectId,
        identityName: body.identityId, scopes: ["task:read", "task:write"],
        canMoveTasksToDone: body.identityId === "oscar", expiresInSeconds: 300,
        sessionExpiresAt: new Date(Date.now() + 12 * 3600_000).toISOString(), accessToken: `private-${id}`,
      });
    }
    requests.push({ path, authorization: options.headers.authorization, cookie: options.headers.cookie });
    return Response.json({ actor: access.get(options.headers.authorization.replace("Bearer private-", ""))?.identityId });
  }));
  broker = await new LocalBroker(directory, vault).start();
});
afterEach(async () => {
  await broker?.close();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  process.exitCode = 0;
});
async function open(identityId = "oscar", leaseSeconds = 1800) {
  const response = await brokerCall(directory, vault, "/sessions", "POST", { binding: { ...binding, identityId }, client: "ordinary client / conversation A", leaseSeconds });
  expect(response.status).toBe(201);
  return response.json();
}
const request = (id: string, path = "/api/projects/project/tasks") => brokerCall(directory, vault, `/sessions/${id}/request`, "POST", { method: "GET", path });

test("ordinary command invocations retain explicit independent same/different identity sessions", async () => {
  const a = await open(); const b = await open(); const nova = await open("nova");
  expect(new Set([a.sessionId, b.sessionId, nova.sessionId]).size).toBe(3);
  expect(a.canMoveTasksToDone).toBe(true);
  expect(nova.canMoveTasksToDone).toBe(false);
  // Fresh option parsing and invocation each time, with no ND_* environment.
  const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  await sessionCommand("status", ["--broker", directory, "--session", a.sessionId], vault);
  expect(JSON.parse(String(output.mock.calls.at(-1)?.[0]))).toMatchObject({ sessionId: a.sessionId, identityId: "oscar" });
  expect(await (await request(nova.sessionId)).json()).toEqual({ actor: "nova" });
  expect(await (await request(a.sessionId)).json()).toEqual({ actor: "oscar" });
  expect(await (await request(nova.sessionId, "tasks")).json()).toEqual({ actor: "nova" });
  expect(requests.at(-1)?.path).toBe("/api/projects/project/tasks");
  await brokerCall(directory, vault, `/sessions/${a.sessionId}`, "DELETE");
  expect((await request(a.sessionId)).status).toBe(403);
  expect((await request(b.sessionId)).status).toBe(200);
  expect((await request(nova.sessionId)).status).toBe(200);
  expect(requests.every((entry) => !entry.cookie)).toBe(true);
});

test("session references alone, browser origins, missing binding and ambiguous selection fail closed", async () => {
  const a = await open();
  expect((await realFetch(`${broker.url}/sessions/${a.sessionId}`)).status).toBe(401);
  const cap = [...vault.write.mock.calls][0][1];
  expect((await realFetch(`${broker.url}/sessions/${a.sessionId}`, { headers: { authorization: `Bearer ${cap}`, origin: "https://evil.example" } })).status).toBe(401);
  for (const next of [{ ...binding, projectId: "other" }, { ...binding, identityId: "unknown" }, { ...binding, base: "https://other.example" }]) {
    expect((await brokerCall(directory, vault, "/sessions", "POST", { binding: next, client: "test" })).status).toBe(403);
  }
  await expect(sessionCommand("status", ["--broker", directory], vault)).rejects.toThrow("--session");
  await expect(sessionCommand("open", ["--broker", directory, "--identity", "Oscar"], vault)).rejects.toThrow("explicit");
  await expect(sessionCommand("status", ["--session", a.sessionId, "--identity", "nova"], vault)).rejects.toThrow("does not apply");
});

test("broker rejects cross-project, authority paths and unsupported methods without forwarding", async () => {
  const a = await open();
  for (const path of ["../other/tasks", "../../auth/agent/runtime", "tasks/../../other/tasks", "/api/projects/other/tasks", "//nexus.example/api/projects/project/tasks", "/api/projects/project/../../auth/agent/runtime", "/api/projects/project/%2f/tasks", "/api/projects/project\\tasks"]) {
    expect((await request(a.sessionId, path)).status).toBe(403);
  }
  expect((await brokerCall(directory, vault, `/sessions/${a.sessionId}/request`, "POST", { method: "CONNECT", path: "/api/projects/project/tasks" })).status).toBe(403);
  expect(requests).toHaveLength(0);
});

test("status never exposes renewable credentials; terminal rejection cannot renew or restart a session", async () => {
  const a = await open();
  const output = await (await brokerCall(directory, vault, `/sessions/${a.sessionId}`)).text();
  const files = await readdir(directory);
  const journal = await readFile(join(directory, "sessions.json"), "utf8");
  for (const text of [JSON.stringify(a), output, journal]) {
    expect(text).not.toContain("private-");
    expect(text).not.toContain("a".repeat(43));
    expect(text).not.toContain("accessToken");
  }
  expect(files).toEqual(expect.arrayContaining(["sessions.json", "endpoint.json", "broker.lock"]));
  access.get(a.sessionId)!.denied = true;
  expect((await brokerCall(directory, vault, `/sessions/${a.sessionId}`)).status).toBe(403);
  const count = runtimeCalls.length;
  expect((await request(a.sessionId)).status).toBe(401);
  expect((await brokerCall(directory, vault, `/sessions/${a.sessionId}`)).status).toBe(403);
  expect(runtimeCalls).toHaveLength(count);
  expect(runtimeCalls.filter((call) => call.operation === "start")).toHaveLength(1);
});

test("idle orphan lease expires without reviving the binding; cleanup retries transient failures", async () => {
  const a = await open("oscar", 60);
  const now = Date.now();
  vi.spyOn(Date, "now").mockReturnValue(now + 61_000);
  await broker.sweep();
  expect((await request(a.sessionId)).status).toBe(403);
  expect(runtimeCalls.filter((call) => call.operation === "end")).toHaveLength(1);
  const end = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ ended: true });
  broker.end = end;
  broker.pending.push({ binding, sessionId: "orphan", createdAt: now });
  await broker.sweep();
  await broker.sweep();
  expect(end).toHaveBeenCalledTimes(1);
  vi.spyOn(Date, "now").mockReturnValue(now + 92_000);
  await broker.sweep();
  expect(end).toHaveBeenCalledTimes(2);
  expect(broker.pending).toEqual([]);
});

test("restart retires persisted sessions and never reconstructs active conversations", async () => {
  const a = await open();
  await broker.close();
  await writeFile(join(directory, "sessions.json"), JSON.stringify([{ binding, sessionId: a.sessionId, createdAt: Date.now() }]));
  const end = vi.fn().mockResolvedValue({ ended: true });
  broker = await new LocalBroker(directory, vault, { end }).start();
  expect(end).toHaveBeenCalledWith(binding, a.sessionId);
  expect((await request(a.sessionId)).status).toBe(403);
  expect(runtimeCalls.filter((call) => call.operation === "start")).toHaveLength(1);
});

test("exclusive broker startup cannot replace a live broker's vault capability", async () => {
  const a = await open();
  const duplicate = new LocalBroker(directory, vault);
  await expect(duplicate.start()).rejects.toThrow();
  expect((await request(a.sessionId)).status).toBe(200);
});

test("an altered endpoint cannot send the vault capability to a remote service", async () => {
  const count = vault.read.mock.calls.length;
  await writeFile(join(directory, "endpoint.json"), JSON.stringify({ url: "https://evil.example" }));
  await expect(brokerCall(directory, vault, "/sessions")).rejects.toThrow("endpoint");
  expect(vault.read.mock.calls.length).toBe(count);
});

test("upstream redirects, cookies and client headers never escape the shared project proxy", async () => {
  const a = await open();
  const fakeUpstream = createServer((_req, res) => res.writeHead(302, { location: "https://evil.example", "set-cookie": "private=value" }).end());
  await new Promise<void>((accept) => fakeUpstream.listen(0, "127.0.0.1", accept));
  try {
    // The production runtime has its own redirect guard. This also exercises
    // the broker adapter's guard when a runtime endpoint misbehaves.
    const port = (fakeUpstream.address() as { port: number }).port;
    broker.sessions.get(a.sessionId)!.runtime.url = `http://127.0.0.1:${port}`;
    expect((await request(a.sessionId)).status).toBe(403);
  } finally {
    fakeUpstream.closeAllConnections();
    await new Promise<void>((accept) => fakeUpstream.close(() => accept()));
  }
});
