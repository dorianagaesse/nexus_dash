import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { lstat, mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { bindingKey, openRuntime, projectRequestUrl, runtimeCall } from "./client.mjs";

export const defaultBrokerDirectory = () => join(homedir(), ".nexusdash", "broker");
const brokerKey = (directory) => createHash("sha256").update(`nexusdash-local-broker:${resolve(directory)}`).digest("hex");
const validId = (value) => typeof value === "string" && /^[\w-]{1,128}$/.test(value);
const json = async (path, value) => {
  await writeFile(`${path}.next`, JSON.stringify(value), { mode: 0o600 });
  await rename(`${path}.next`, path);
};
async function readBody(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new Error("Request too large");
    chunks.push(chunk);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

// The OS account and trusted CLI are the local authentication boundary. A
// public session ID never authenticates a caller. The broker capability is
// stored in the OS vault, independently of all per-identity device proofs.
export async function brokerCall(directory, vault, path, method = "GET", body) {
  const endpoint = JSON.parse(await readFile(join(resolve(directory), "endpoint.json"), "utf8"));
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(endpoint.url) || !path.startsWith("/sessions"))
    throw new Error("Invalid local broker endpoint");
  const target = new URL(path, endpoint.url);
  if (target.origin !== endpoint.url) throw new Error("Invalid local broker request");
  return fetch(target, {
    method, redirect: "error", signal: AbortSignal.timeout(60_000),
    headers: { authorization: `Bearer ${await vault.read(brokerKey(directory))}`, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

export class LocalBroker {
  constructor(directory, vault, dependencies = {}) {
    this.directory = resolve(directory);
    this.vault = vault;
    // Share the runtime/proxy core with the controlled launcher and ND-823's
    // Docker adapter. This adapter supplies ordinary-client lifecycle only.
    this.openRuntime = dependencies.openRuntime ?? openRuntime;
    this.end = dependencies.end ?? (async (binding, sessionId) => runtimeCall(binding, {
      operation: "end", proof: await vault.read(bindingKey(binding)), sessionId,
    }));
    this.sessions = new Map();
    this.pending = [];
    this.queue = Promise.resolve();
    this.stopping = false;
  }
  path(name) { return join(this.directory, name); }
  serial(action) {
    const next = this.queue.then(action);
    this.queue = next.catch(() => {});
    return next;
  }
  async save() { await json(this.path("sessions.json"), this.pending); }
  async cleanup() {
    for (const entry of [...this.pending]) {
      if (this.sessions.has(entry.sessionId) || entry.retryAt > Date.now()) continue;
      if (entry.createdAt + 12 * 3600_000 > Date.now()) {
        try { await this.end(entry.binding, entry.sessionId); }
        catch (error) {
          if (![401, 403, 404].includes(error.status)) {
            entry.attempts = (entry.attempts ?? 0) + 1;
            entry.retryAt = Date.now() + Math.min(300_000, 30_000 * 2 ** Math.min(entry.attempts - 1, 4));
            continue;
          }
        }
      }
      this.pending = this.pending.filter((candidate) => candidate !== entry);
    }
    await this.save();
  }
  async retire(sessionId) {
    const entry = this.sessions.get(sessionId);
    if (!entry) return;
    this.sessions.delete(sessionId);
    try {
      await entry.runtime.close();
      this.pending = this.pending.filter((candidate) => candidate.sessionId !== sessionId);
      await this.save();
    } catch { /* A persisted orphan is retried with bounded backoff. */ }
  }
  async sweep() {
    return this.serial(async () => {
      for (const [id, entry] of this.sessions) {
        if (entry.leaseExpiresAt <= Date.now()) await this.retire(id);
      }
      await this.cleanup();
    });
  }
  async handle(request, response) {
    response.setHeader("Cache-Control", "no-store");
    const supplied = Buffer.from(request.headers.authorization ?? "");
    const expected = Buffer.from(`Bearer ${this.capability}`);
    if (this.stopping || !this.url || request.headers.origin || request.headers.host !== new URL(this.url).host ||
      supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      response.writeHead(401).end();
      return;
    }
    try {
      const body = await readBody(request);
      await this.serial(async () => {
        if (this.stopping) throw new Error("Broker is stopping");
        if (request.method === "POST" && request.url === "/sessions") {
          const binding = body.binding;
          bindingKey(binding);
          if (typeof body.client !== "string" || !body.client.trim() || body.client.length > 80)
            throw new Error("Explicit client/execution description required");
          // Idle lease bounds orphaned conversations. Activity can extend it,
          // but never the server's fixed twelve-hour session ceiling.
          const leaseSeconds = body.leaseSeconds ?? 1800;
          if (!Number.isInteger(leaseSeconds) || leaseSeconds < 60 || leaseSeconds > 3600)
            throw new Error("Idle lease must be 60 to 3600 seconds");
          const runtime = await this.openRuntime(binding, this.vault, body.client);
          const entry = { binding, runtime, leaseSeconds, leaseExpiresAt: Date.now() + leaseSeconds * 1000 };
          this.sessions.set(runtime.sessionId, entry);
          this.pending.push({ binding, sessionId: runtime.sessionId, createdAt: Date.now() });
          try {
            await this.save();
            const status = await runtime.status();
            response.writeHead(201, { "Content-Type": "application/json" })
              .end(JSON.stringify({ ...status, leaseExpiresAt: new Date(entry.leaseExpiresAt).toISOString() }));
          } catch (error) {
            await this.retire(runtime.sessionId);
            throw error;
          }
          return;
        }
        const match = /^\/sessions\/([\w-]{1,128})(\/request)?$/.exec(request.url);
        const id = match?.[1];
        const entry = this.sessions.get(id);
        if (!entry || entry.leaseExpiresAt <= Date.now()) {
          if (entry) await this.retire(id);
          throw new Error("Unknown, closed or expired session; open a new explicit binding");
        }
        if (request.method === "DELETE" && !match[2]) {
          await this.retire(id);
          response.writeHead(200, { "Content-Type": "application/json" }).end('{"closed":true}');
          return;
        }
        if (request.method === "GET" && !match[2]) {
          const status = await entry.runtime.status();
          entry.leaseExpiresAt = Date.now() + entry.leaseSeconds * 1000;
          response.writeHead(200, { "Content-Type": "application/json" })
            .end(JSON.stringify({ ...status, leaseExpiresAt: new Date(entry.leaseExpiresAt).toISOString() }));
          return;
        }
        if (request.method !== "POST" || !match[2] ||
          !["GET", "POST", "PATCH", "PUT", "DELETE"].includes(body.method))
          throw new Error("Invalid session operation");
        // Project-relative paths also work from Git Bash/MSYS, which otherwise
        // rewrites /api/... arguments before a native Node process sees them.
        const path = typeof body.path === "string" && !body.path.startsWith("/")
          ? `/api/projects/${entry.binding.projectId}/${body.path}` : body.path;
        projectRequestUrl(entry.binding.base, entry.binding.projectId, path);
        if (body.body !== undefined && typeof body.body !== "string") throw new Error("Body must be JSON text");
        const target = new URL(path, entry.runtime.url);
        if (target.origin !== entry.runtime.url) throw new Error("Invalid runtime transport target");
        const upstream = await fetch(target, {
          method: body.method, redirect: "error", signal: AbortSignal.timeout(35_000),
          headers: { authorization: `Bearer ${entry.runtime.capability}`, "Content-Type": "application/json" },
          ...(body.body === undefined ? {} : { body: body.body }),
        });
        entry.leaseExpiresAt = Date.now() + entry.leaseSeconds * 1000;
        response.writeHead(upstream.status, { "Content-Type": upstream.headers.get("content-type") ?? "application/json" });
        response.end(Buffer.from(await upstream.arrayBuffer()));
      });
    } catch {
      if (!response.headersSent) response.writeHead(403, { "Content-Type": "application/json" });
      response.end('{"error":"session-access-unavailable","recovery":"Check the explicit session, broker, origin and owner authorization. No credential fallback is attempted."}');
    }
  }
  async start() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const info = await lstat(this.directory);
    if (!info.isDirectory() || info.isSymbolicLink() ||
      (process.getuid && (info.uid !== process.getuid() || (info.mode & 0o077))))
      throw new Error("Broker state must be an owner-only directory");
    // Exclusive startup; a crash lock needs deliberate operator recovery.
    this.lock = await open(this.path("broker.lock"), "wx", 0o600);
    try {
      await this.lock.writeFile(JSON.stringify({ pid: process.pid }));
      try { this.pending = JSON.parse(await readFile(this.path("sessions.json"), "utf8")); }
      catch (error) { if (error.code !== "ENOENT") throw error; }
      if (!Array.isArray(this.pending) || this.pending.some((entry) => {
        if (!validId(entry.sessionId) || !Number.isFinite(entry.createdAt)) return true;
        bindingKey(entry.binding);
        return false;
      })) throw new Error("Invalid session cleanup journal");
      this.initialized = true;
      await this.cleanup();
      this.capability = randomBytes(32).toString("base64url");
      await this.vault.write(brokerKey(this.directory), this.capability);
      this.server = createServer((request, response) => { void this.handle(request, response); });
      this.server.requestTimeout = 60_000;
      this.server.headersTimeout = 10_000;
      await new Promise((accept, reject) => {
        this.server.once("error", reject);
        this.server.listen(0, "127.0.0.1", accept);
      });
      this.url = `http://127.0.0.1:${this.server.address().port}`;
      await json(this.path("endpoint.json"), { url: this.url, pid: process.pid });
      this.timer = setInterval(() => { void this.sweep().catch(() => {}); }, 10_000);
      return this;
    } catch (error) {
      await this.close();
      throw error;
    }
  }
  async close() {
    this.closePromise ??= this.shutdown();
    return this.closePromise;
  }
  async shutdown() {
    this.stopping = true;
    clearInterval(this.timer);
    this.server?.closeAllConnections();
    if (this.server) await new Promise((accept) => this.server.close(accept));
    if (this.lock) {
      try {
        if (this.initialized) await this.serial(async () => {
          for (const id of this.sessions.keys()) await this.retire(id);
          await this.cleanup();
        });
      } finally {
        await rm(this.path("endpoint.json"), { force: true });
        await this.lock.close();
        this.lock = null;
        await rm(this.path("broker.lock"), { force: true });
      }
    }
  }
}
