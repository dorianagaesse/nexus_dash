import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtemp, copyFile, writeFile, readFile, rm, unlink } from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import { join, resolve } from "node:path";
import { DockerBroker, docker } from "../../scripts/agent-runtime/docker-broker.mjs";
import { pairDevice, bindingKey, openRuntime } from "../../scripts/agent-runtime/client.mjs";
import { createVault } from "../../scripts/agent-runtime/vault.mjs";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";

// Explicit opt-in: this test creates only named disposable Docker resources.
test("Docker executions retain actor identity with independent, isolated sessions", async ({ page }, testInfo) => {
  test.skip(process.env.ND_DOCKER_VALIDATION !== "1", "Enable ND_DOCKER_VALIDATION=1 with a local Docker daemon and OpenSSL");
  test.setTimeout(300_000);
  await signInAsVerifiedUser(page);
  const projectResponse = await page.request.post("/api/projects", { data: { name: "ND823 disposable Docker validation" } });
  expect(projectResponse.ok()).toBeTruthy();
  const { project } = await projectResponse.json();
  const endpoint = `/api/projects/${project.id}/agent-identities`;
  const command = async (data: Record<string, unknown>) => {
    const response = await page.request.post(endpoint, { data });
    expect(response.ok(), `Identity operation ${data.operation} returned ${response.status()}`).toBeTruthy();
    return response.json();
  };
  const scopes = ["project:read", "task:read", "task:write"];
  const { identityId } = await command({ operation: "create", name: "Docker Oscar", scopes, canMoveTasksToDone: false });
  const binding = { base: String(testInfo.project.use.baseURL), projectId: project.id, identityId };
  const { pairingCode, deviceId } = await command({ operation: "authorize-device", identityId, name: "Disposable broker", scopes, canMoveTasksToDone: false });
  const secrets = new Map<string, string>();
  const nativeVault = createVault();
  const vault = { write: async (key: string, value: string) => { secrets.set(key, value); await nativeVault.write(key, value); }, read: async (key: string) => {
    if (!secrets.has(key)) throw new Error("Missing exact binding"); return nativeVault.read(key);
  } };
  await pairDevice(binding, pairingCode, vault);
  // Return the valid Oscar proof for a mismatched binding so the start request
  // reaches the server; the local exact-binding lookup is not what is under test.
  const mismatchedVault = { read: async () => nativeVault.read(bindingKey(binding)) };
  await expect(openRuntime({ ...binding, identityId: "wrong-identity" }, mismatchedVault, "invalid"))
    .rejects.toThrow(/Runtime access rejected/);
  const nova = await command({ operation: "create", name: "Docker Nova", scopes, canMoveTasksToDone: false });
  const novaBinding = { ...binding, identityId: nova.identityId };
  const novaGrant = await command({ operation: "authorize-device", identityId: nova.identityId, name: "Independent Nova", scopes, canMoveTasksToDone: false });
  await pairDevice(novaBinding, novaGrant.pairingCode, vault);
  const directory = await mkdtemp(join(tmpdir(), "nd823-docker-"));
  const suffix = Date.now();
  const names = [`nd823-one-${suffix}`, `nd823-two-${suffix}`, `nd823-nova-${suffix}`];
  const image = `nd823-worker:${suffix}`;
  let broker: DockerBroker | undefined;
  try {
    const certFile = join(directory, "cert.pem");
    const keyFile = join(directory, "key.pem");
    const openssl = process.env.ND_OPENSSL ?? (process.platform === "win32" ? "C:/Program Files/Git/usr/bin/openssl.exe" : "openssl");
    execFileSync(openssl, ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-keyout", keyFile, "-out", certFile,
      "-subj", "/CN=host.docker.internal", "-addext", "subjectAltName=DNS:host.docker.internal"], { windowsHide: true, stdio: "ignore" });
    await copyFile(resolve("scripts/nd-sandbox-request.mjs"), join(directory, "request.mjs"));
    await writeFile(join(directory, "Dockerfile"), "FROM node:24-bookworm\nCOPY request.mjs /request.mjs\n");
    // Only the helper and Dockerfile enter the image; TLS key/proofs are excluded.
    await writeFile(join(directory, ".dockerignore"), "*\n!Dockerfile\n!request.mjs\n");
    execFileSync("docker", ["build", "-q", "-t", image, directory], { windowsHide: true, timeout: 60000, stdio: "pipe" });
    const workerBroker = new DockerBroker({ url: "https://host.docker.internal:44483", keyFile, certFile,
      stateDirectory: join(directory, "state"), workers: names.map((name, index) => ({ name, image, binding: index === 2 ? novaBinding : binding, command: ["node", "-e", "setInterval(()=>{},1000)"] })) }, vault);
    broker = workerBroker;
    const readBinding = async (index: number) => JSON.parse(await readFile(join(workerBroker.transport(workerBroker.workers.get(names[index])), "binding.json"), "utf8"));
    const request = (index: number, method = "GET", path = `/api/projects/${project.id}/tasks`, body?: string) =>
      docker(["exec", names[index], "node", "/request.mjs", method, path, ...(body ? [body] : [])]);
    await broker.initialize();
    await broker.createWorkers();
    await broker.listen();
    await broker.reconcile();
    const first = await readBinding(0);
    const second = await readBinding(1);
    expect(first.identityId).toBe(identityId);
    expect(first.sessionId).not.toBe(second.sessionId);
    expect(first.capability).not.toBe(second.capability);
    expect((await readBinding(2)).identityId).toBe(nova.identityId);
    expect(JSON.parse(await request(0)).tasks).toEqual([]);
    const task = JSON.parse(await request(0, "POST", `/api/projects/${project.id}/tasks`, JSON.stringify({ title: "Docker actor contribution" })));
    expect(task.task.createdBy.id).toBe(identityId);
    await expect(request(0, "GET", "/api/projects/wrong-project/tasks")).rejects.toThrow();
    const inspect = JSON.parse(await docker(["inspect", names[0]]))[0];
    if (process.getuid) expect(inspect.Config.User).toBe(`${process.getuid()}:${process.getgid()}`);
    expect(inspect.Mounts).toHaveLength(1);
    expect(inspect.Mounts[0].Destination).toBe("/run/nd-agent");
    expect(inspect.Config.Env.join(" ")).not.toContain(pairingCode);
    for (const proof of secrets.values()) expect(JSON.stringify(inspect)).not.toContain(proof);
    await expect(docker(["exec", names[0], "test", "-e", "/var/run/docker.sock"])).rejects.toThrow();
    await expect(docker(["exec", names[0], "test", "-e", `/run/worker-${names[1]}/binding.json`])).rejects.toThrow();
    // One session is ended by the owner; polling must never resurrect it.
    await command({ operation: "end-session", identityId, sessionId: first.sessionId });
    await expect(request(0)).rejects.toThrow();
    await broker.reconcile();
    expect((await readBinding(0)).sessionId).toBe(first.sessionId);
    expect(JSON.parse(await request(1)).tasks).toHaveLength(1);
    await docker(["restart", names[0]]);
    await broker.reconcile();
    const restarted = await readBinding(0);
    expect(restarted.sessionId).not.toBe(first.sessionId);
    expect(restarted.identityId).toBe(identityId);
    // Trigger the real renewal exchange without waiting five wall-clock minutes.
    const realNow = Date.now;
    Date.now = () => realNow() + 280_000;
    try { expect(JSON.parse(await request(0)).tasks).toHaveLength(1); }
    finally { Date.now = realNow; }
    await command({ operation: "update", identityId, name: "Docker Oscar", scopes: ["task:read"], canMoveTasksToDone: false });
    await expect(request(0, "POST", `/api/projects/${project.id}/tasks`, JSON.stringify({ title: "Denied" }))).rejects.toThrow();
    expect(JSON.parse(await request(1)).tasks).toHaveLength(1);
    await docker(["stop", names[0]]);
    await broker.reconcile();
    expect((await readBinding(0)).error).toBe("worker-not-authorized");
    await docker(["rm", names[0]]);
    // Recreate one configured worker through a temporary single-worker view.
    const siblings = names.slice(1).map(name => [name, broker.workers.get(name)] as const);
    for (const [name] of siblings) broker.workers.delete(name);
    await broker.createWorkers();
    for (const [name, sibling] of siblings) broker.workers.set(name, sibling);
    await broker.reconcile();
    expect((await readBinding(0)).identityId).toBe(identityId);
    expect((await readBinding(0)).sessionId).not.toBe(restarted.sessionId);
    await command({ operation: "revoke-device", identityId, deviceId });
    await expect(request(0)).rejects.toThrow();
    await expect(request(1)).rejects.toThrow();
    expect(JSON.parse(await request(2)).tasks).toHaveLength(1);
  } finally {
    try { await broker?.close(); } catch { /* cleanup is best effort */ }
    for (const name of names) { try { await docker(["rm", "-f", name]); } catch { /* already removed */ } }
    try { await docker(["image", "rm", image]); } catch { /* build never completed */ }
    // This is the unique mkdtemp directory created by this test, never a supplied path.
    try { await rm(directory, { recursive: true, force: true }); } catch { /* retry on next temp cleanup */ }
    for (const item of [binding, novaBinding]) {
      const key = bindingKey(item);
      if (process.platform === "win32") await unlink(join(homedir(), ".nexusdash", "vault", key)).catch(() => {});
      else if (process.platform === "linux") { try { execFileSync("secret-tool", ["clear", "service", "nexusdash-agent", "binding", key]); } catch { /* not stored */ } }
      else if (process.platform === "darwin") { try { execFileSync("security", ["delete-generic-password", "-s", "nexusdash-agent", "-a", key]); } catch { /* not stored */ } }
    }
  }
});
