import { execFile } from "node:child_process";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createServer } from "node:https";
import { resolve, join } from "node:path";
import { bindingKey, openRuntime, runtimeCall } from "./client.mjs";

export function docker(args) {
  return new Promise((accept, reject) => {
    execFile("docker", args, { windowsHide: true, timeout: 15_000, maxBuffer: 1024 * 1024 },
      (error, stdout) => error ? reject(new Error("Docker operation failed; check the daemon and container.")) : accept(stdout.trim()));
  });
}

export function validateConfig(config) {
  const url = new URL(config.url);
  if (url.protocol !== "https:" || url.pathname !== "/" || url.username || url.password || url.search || url.hash)
    throw new Error("Broker URL must be an explicit HTTPS origin");
  if (!config.stateDirectory || !config.keyFile || !config.certFile || !Array.isArray(config.workers) || !config.workers.length)
    throw new Error("State directory, TLS files and workers are required");
  const names = new Set();
  for (const worker of config.workers) {
    bindingKey(worker.binding);
    if (!/^[a-z][a-z0-9-]{0,47}$/.test(worker.name) || names.has(worker.name) || !worker.image ||
      !Array.isArray(worker.command) || !worker.command.length || worker.command.some(v => typeof v !== "string"))
      throw new Error("Each worker needs a unique name, image, command and explicit binding");
    names.add(worker.name);
  }
  return config;
}

async function atomicJson(path, value) {
  await writeFile(`${path}.next`, JSON.stringify(value), { mode: 0o600 });
  await rename(`${path}.next`, path);
}

export function hostMountPath(path) {
  const normalized = path.replaceAll("\\", "/").replace(/^\/run\/desktop\/mnt\/host\/([a-z])\//i, "$1:/")
    .replace(/^\/host_mnt\/([a-z])\//i, "$1:/");
  return /^[a-z]:\//i.test(normalized) ? normalized.toLowerCase() : normalized;
}

// A single operator owns this state directory. Only the worker's own transport
// directory is mounted, never the parent directory, vault or Docker socket.
export class DockerBroker {
  constructor(config, vault, dependencies = {}) {
    this.config = validateConfig(config);
    this.vault = vault;
    this.command = dependencies.docker ?? docker;
    this.open = dependencies.openRuntime ?? openRuntime;
    this.end = dependencies.end ?? (async (binding, sessionId) => runtimeCall(binding, {
      operation: "end", sessionId, proof: await vault.read(bindingKey(binding)),
    }));
    this.workers = new Map(config.workers.map(worker => [worker.name, { ...worker, generation: null, runtime: null, capability: null }]));
    this.pending = [];
    this.queue = Promise.resolve();
    this.stopping = false;
  }

  path(name) { return join(resolve(this.config.stateDirectory), name); }
  transport(worker) { return this.path(`worker-${worker.name}`); }
  async save() { await atomicJson(this.path("sessions.json"), this.pending); }
  serial(action) {
    const next = this.queue.then(action);
    this.queue = next.catch(() => {});
    return next;
  }

  async initialize() {
    await mkdir(this.path("."), { recursive: true, mode: 0o700 });
    // Fail on corrupt state rather than silently forgetting stale sessions.
    try { this.pending = JSON.parse(await readFile(this.path("sessions.json"), "utf8")); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    if (!Array.isArray(this.pending)) throw new Error("Invalid broker session journal");
    for (const worker of this.workers.values()) {
      await mkdir(this.transport(worker), { recursive: true, mode: 0o700 });
      await atomicJson(join(this.transport(worker), "binding.json"), { error: "worker-not-authorized" });
      await writeFile(join(this.transport(worker), "ca.pem"), await readFile(this.config.certFile));
      // A broker restart must not resurrect an owner-ended session in an
      // unchanged execution. Restart the worker explicitly after recovery.
      worker.generation = await this.inspect(worker);
    }
    await this.cleanup();
  }

  async cleanup() {
    const active = new Set([...this.workers.values()].map(w => w.runtime?.sessionId));
    for (const entry of [...this.pending]) {
      if (active.has(entry.sessionId)) continue;
      if (entry.createdAt && Date.now() - entry.createdAt >= 12 * 3600_000) {
        this.pending = this.pending.filter(e => e !== entry);
        continue;
      }
      try { await this.end(entry.binding, entry.sessionId); }
      catch { continue; } // Revoked/expired sessions already deny access. Retry at the bounded poll interval.
      this.pending = this.pending.filter(e => e !== entry);
    }
    await this.save();
  }

  async inspect(worker) {
    const rows = JSON.parse(await this.command(["container", "ls", "-a", "--filter", `name=^/${worker.name}$`, "--format", "json"]).then(output => `[${output.split(/\r?\n/).filter(Boolean).join(",")}]`));
    if (!rows.length) return null;
    const [container] = JSON.parse(await this.command(["inspect", "--type", "container", worker.name]));
    const label = container.Config?.Labels?.["app.nexusdash.binding"];
    const mounts = container.Mounts ?? [];
    if (label !== bindingKey(worker.binding) || container.HostConfig?.Privileged ||
      !container.HostConfig?.ReadonlyRootfs || container.HostConfig?.CapAdd?.length ||
      !container.HostConfig?.CapDrop?.includes("ALL") ||
      !container.HostConfig?.SecurityOpt?.includes("no-new-privileges") ||
      container.HostConfig?.NetworkMode === "host" || container.HostConfig?.PidMode === "host" ||
      mounts.some(m => m.Destination !== "/run/nd-agent" || m.RW) || mounts.length !== 1 ||
      hostMountPath(mounts[0].Source) !== hostMountPath(this.transport(worker)))
      throw new Error("Container isolation or identity binding changed; operator review required");
    return container.State.Running && !container.State.Paused && !container.State.Restarting
      ? `${container.Id}:${container.State.StartedAt}` : null;
  }

  async createWorkers() {
    for (const worker of this.workers.values()) {
      // An existing container is never deleted or silently replaced.
      const existing = await this.command(["container", "ls", "-a", "--filter", `name=^/${worker.name}$`, "--format", "{{.ID}}"]);
      if (existing) throw new Error(`Container ${worker.name} already exists; omit --create or remove it explicitly`);
      await this.command(["create", "--name", worker.name, "--label", `app.nexusdash.binding=${bindingKey(worker.binding)}`,
        "--cap-drop=ALL", "--security-opt=no-new-privileges", "--read-only", "--tmpfs", "/tmp:rw,nosuid,nodev,size=128m",
        "--add-host=host.docker.internal:host-gateway", "--mount", `type=bind,source=${this.transport(worker)},target=/run/nd-agent,readonly`,
        "--env", "ND_AGENT_BINDING_FILE=/run/nd-agent/binding.json", worker.image, ...worker.command]);
      await this.command(["start", worker.name]);
    }
  }

  async retire(worker) {
    const runtime = worker.runtime;
    worker.runtime = null;
    worker.capability = null;
    await atomicJson(join(this.transport(worker), "binding.json"), { error: "worker-not-authorized" });
    if (runtime) {
      try {
        await runtime.close();
        this.pending = this.pending.filter(entry => entry.sessionId !== runtime.sessionId);
        await this.save();
      } catch { /* persisted cleanup is retried */ }
    }
  }

  async reconcileWorker(worker) {
    let generation;
    try { generation = await this.inspect(worker); }
    catch (error) { await this.retire(worker); throw error; }
    if (generation === worker.generation) return;
    await this.retire(worker);
    worker.generation = generation;
    if (!generation || this.stopping) return;
    // One attempt per observed execution. Rejected/expired grants are never
    // recovered by creating new identities or repeatedly starting sessions.
    worker.runtime = await this.open(worker.binding, this.vault, `docker:${worker.name}`);
    this.pending.push({ binding: worker.binding, sessionId: worker.runtime.sessionId, createdAt: Date.now() });
    await this.save();
    worker.capability = randomBytes(32).toString("base64url");
    await atomicJson(join(this.transport(worker), "binding.json"), {
      url: new URL(this.config.url).origin, capability: worker.capability,
      sessionId: worker.runtime.sessionId, projectId: worker.binding.projectId, identityId: worker.binding.identityId,
    });
  }

  async reconcile() {
    return this.serial(async () => {
      for (const worker of this.workers.values()) {
        try { await this.reconcileWorker(worker); }
        catch { console.error(`Worker ${worker.name}: access unavailable; inspect binding, Docker state and owner authorization.`); }
      }
      await this.cleanup();
    });
  }

  async listen() {
    const url = new URL(this.config.url);
    this.server = createServer({ key: await readFile(this.config.keyFile), cert: await readFile(this.config.certFile), minVersion: "TLSv1.2" }, async (request, response) => {
      response.setHeader("Cache-Control", "no-store");
      try {
        if (this.stopping || request.headers.origin || request.headers.host !== url.host) throw new Error();
        const supplied = Buffer.from(request.headers.authorization ?? "");
        const worker = [...this.workers.values()].find(w => {
          const expected = Buffer.from(`Bearer ${w.capability}`);
          return w.capability && supplied.length === expected.length && timingSafeEqual(supplied, expected);
        });
        if (!worker) throw new Error();
        const capability = worker.capability;
        await this.serial(() => this.reconcileWorker(worker));
        if (!worker.runtime || worker.capability !== capability) throw new Error();
        const runtime = worker.runtime;
        const chunks = [];
        let size = 0;
        for await (const chunk of request) {
          size += chunk.length;
          if (size > 1024 * 1024) throw new Error();
          chunks.push(chunk);
        }
        // The existing loopback proxy enforces project, method and redirect
        // restrictions and never forwards caller headers or upstream cookies.
        const target = new URL(request.url, runtime.url);
        if (target.origin !== runtime.url) throw new Error();
        const result = await fetch(target, { method: request.method, redirect: "error",
          headers: { authorization: `Bearer ${runtime.capability}`, "Content-Type": "application/json" },
          body: size ? Buffer.concat(chunks) : undefined, signal: AbortSignal.timeout(30_000) });
        response.writeHead(result.status, { "Content-Type": result.headers.get("content-type") ?? "application/json" });
        response.end(Buffer.from(await result.arrayBuffer()));
      } catch { response.writeHead(403).end('{"error":"sandbox-access-unavailable"}'); }
    });
    this.server.requestTimeout = 35_000;
    await new Promise((accept, reject) => {
      this.server.once("error", reject);
      this.server.listen(Number(url.port || 443), this.config.listenAddress ?? "0.0.0.0", accept);
    });
  }

  async close() {
    this.stopping = true;
    this.server?.closeAllConnections();
    if (this.server) await new Promise(accept => this.server.close(accept));
    await this.serial(async () => {
      for (const worker of this.workers.values()) await this.retire(worker);
      await this.cleanup();
    });
  }
}
