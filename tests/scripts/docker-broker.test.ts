import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { DockerBroker, hostMountPath, validateConfig } from "../../scripts/agent-runtime/docker-broker.mjs";

const folders: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(folders.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
const binding = { base: "https://nexus-dash.app", projectId: "project", identityId: "oscar" };
async function setup() {
  const directory = await mkdtemp(join(tmpdir(), "nd-broker-"));
  folders.push(directory);
  const certFile = join(directory, "cert.pem");
  await writeFile(certFile, "test certificate");
  let sequence = 0;
  const close = vi.fn();
  const openRuntime = vi.fn(async () => ({ sessionId: `session-${++sequence}`, close }));
  const end = vi.fn();
  const broker = new DockerBroker({ url: "https://host.docker.internal:4443", stateDirectory: directory,
    keyFile: "key", certFile, workers: ["one", "two"].map(name => ({ name, binding, image: "node:24", command: ["sleep", "infinity"] })) }, {}, { openRuntime, end });
  const generations: Record<string, string | null> = { one: null, two: null };
  vi.spyOn(broker, "inspect").mockImplementation(async worker => generations[worker.name]);
  await broker.initialize();
  return { broker, generations, openRuntime, close, end, directory };
}

test("detached workers keep independent sessions; restart/recreation rotates capability and session while retaining identity", async () => {
  const { broker, generations, openRuntime, close } = await setup();
  generations.one = "container-a:start-1";
  generations.two = "container-b:start-1";
  await broker.reconcile();
  const first = JSON.parse(await readFile(join(broker.transport(broker.workers.get("one")), "binding.json"), "utf8"));
  const second = broker.workers.get("two").runtime.sessionId;
  await broker.reconcile();
  expect(openRuntime).toHaveBeenCalledTimes(2);
  generations.one = "container-a:start-2";
  await broker.reconcile();
  const restarted = JSON.parse(await readFile(join(broker.transport(broker.workers.get("one")), "binding.json"), "utf8"));
  expect(restarted.identityId).toBe(first.identityId);
  expect(restarted.sessionId).not.toBe(first.sessionId);
  expect(restarted.capability).not.toBe(first.capability);
  expect(broker.workers.get("two").runtime.sessionId).toBe(second);
  generations.one = "container-c:start-3";
  await broker.reconcile();
  expect(openRuntime).toHaveBeenCalledTimes(4);
  generations.one = null;
  await broker.reconcile();
  expect(broker.workers.get("one").runtime).toBeNull();
  expect(close).toHaveBeenCalledTimes(3);
  await broker.close();
});

test("rejected authorization does not retry on every poll or inherit another worker's access", async () => {
  const { broker, generations, openRuntime } = await setup();
  vi.spyOn(console, "error").mockImplementation(() => {});
  openRuntime.mockRejectedValueOnce(new Error("revoked"));
  generations.one = "container:start";
  await broker.reconcile();
  await broker.reconcile();
  expect(openRuntime).toHaveBeenCalledTimes(1);
  expect(broker.workers.get("one").capability).toBeNull();
  await broker.close();
});

test("broker recovery cleans journaled sessions and requires an explicit new execution", async () => {
  const { broker, generations, openRuntime, directory, end } = await setup();
  await writeFile(join(directory, "sessions.json"), JSON.stringify([{ binding, sessionId: "stale", createdAt: Date.now() }]));
  generations.one = "already-running:start";
  await broker.initialize();
  await broker.reconcile();
  expect(end).toHaveBeenCalledWith(binding, "stale");
  expect(openRuntime).not.toHaveBeenCalled();
  generations.one = "already-running:restart";
  await broker.reconcile();
  expect(openRuntime).toHaveBeenCalledTimes(1);
  await broker.close();
});

test("daemon failure immediately retires local access; stale cleanup remains journaled during outage", async () => {
  const { broker, generations, end, close, directory } = await setup();
  generations.one = "container:start";
  await broker.reconcile();
  end.mockRejectedValue(new Error("offline"));
  close.mockRejectedValue(new Error("offline"));
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(broker.inspect).mockRejectedValue(new Error("daemon offline"));
  await broker.reconcile();
  expect(broker.workers.get("one").capability).toBeNull();
  expect(JSON.parse(await readFile(join(directory, "sessions.json"), "utf8"))).toHaveLength(1);
  end.mockResolvedValue(undefined);
  await broker.close();
});

test("configuration fails closed and Docker Desktop mount paths normalize", () => {
  expect(() => validateConfig({ url: "http://host.docker.internal" })).toThrow();
  expect(() => validateConfig({ url: "https://host/path" })).toThrow();
  expect(hostMountPath("/run/desktop/mnt/host/c/Users/Test")).toBe(hostMountPath("C:\\Users\\Test"));
});
