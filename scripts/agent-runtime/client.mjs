import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { spawn } from "node:child_process";

export function bindingKey({ base, projectId, identityId }) {
  const url = new URL(base);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)
      ))
  )
    throw new Error("Use an HTTPS origin (HTTP is allowed only for localhost)");
  if (!/^[\w-]+$/.test(projectId ?? "") || !/^[\w-]+$/.test(identityId ?? ""))
    throw new Error("Explicit project and identity IDs are required");
  return createHash("sha256")
    .update(JSON.stringify([url.origin, projectId, identityId]))
    .digest("hex");
}

export async function runtimeCall(binding, body) {
  const response = await fetch(
    new URL("/api/auth/agent/runtime", binding.base),
    {
      method: "POST",
      redirect: "error",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...body,
        projectId: binding.projectId,
        identityId: binding.identityId,
      }),
      signal: AbortSignal.timeout(15_000),
    }
  );
  if (!response.ok)
    throw new Error(
      `Runtime access rejected (${response.status}). Check the selected identity and device authorization.`
    );
  return response.json();
}

export async function pairDevice(binding, pairingCode, vault) {
  const key = bindingKey(binding);
  const result = await runtimeCall(binding, {
    operation: "pair",
    proof: pairingCode,
  });
  if (
    result.projectId !== binding.projectId ||
    result.identityId !== binding.identityId
  )
    throw new Error("Runtime binding mismatch");
  await vault.write(key, result.runtimeCredential);
}

export function projectRequestUrl(base, projectId, path) {
  if (typeof path !== "string" || !path.startsWith("/") || path.includes("\\"))
    throw new Error("Invalid project request path");
  const target = new URL(path, base);
  const prefix = `/api/projects/${projectId}`;
  if (
    target.origin !== new URL(base).origin ||
    (target.pathname !== prefix && !target.pathname.startsWith(`${prefix}/`)) ||
    /%2f|%5c|%2e/i.test(target.pathname)
  )
    throw new Error("Request is outside the bound project");
  return target;
}

export async function openRuntime(binding, vault, client) {
  const proof = await vault.read(bindingKey(binding));
  let token = await runtimeCall(binding, { operation: "start", proof, client });
  if (
    token.projectId !== binding.projectId ||
    token.identityId !== binding.identityId ||
    !token.sessionId ||
    !token.deviceId
  )
    throw new Error("Runtime binding mismatch");
  const sessionId = token.sessionId;
  let renewAt = Date.now() + Math.max(1, token.expiresInSeconds - 30) * 1000;
  let renewing;
  let closed = false;
  const capability = randomBytes(32).toString("base64url");
  const server = createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    const supplied = Buffer.from(request.headers.authorization ?? "");
    const expected = Buffer.from(`Bearer ${capability}`);
    if (
      closed ||
      request.headers.origin ||
      request.headers.host !== `127.0.0.1:${server.address().port}` ||
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    ) {
      response.writeHead(401).end();
      return;
    }
    try {
      const target = projectRequestUrl(
        binding.base,
        binding.projectId,
        request.url
      );
      if (!["GET", "POST", "PATCH", "PUT", "DELETE"].includes(request.method))
        throw new Error("Unsupported method");
      const chunks = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 1024 * 1024) throw new Error("Request too large");
        chunks.push(chunk);
      }
      if (Date.now() >= renewAt) {
        renewing ??= runtimeCall(binding, {
          operation: "renew",
          proof,
          sessionId,
        })
          .then((next) => {
            if (
              next.sessionId !== sessionId ||
              next.deviceId !== token.deviceId ||
              next.identityId !== binding.identityId ||
              next.projectId !== binding.projectId
            )
              throw new Error("Runtime binding mismatch");
            token = next;
            renewAt =
              Date.now() + Math.max(1, next.expiresInSeconds - 30) * 1000;
          })
          .finally(() => {
            renewing = null;
          });
        await renewing;
      }
      const result = await fetch(target, {
        method: request.method,
        redirect: "manual",
        headers: {
          authorization: `Bearer ${token.accessToken}`,
          "Content-Type": "application/json",
        },
        body: size ? Buffer.concat(chunks) : undefined,
        signal: AbortSignal.timeout(30_000),
      });
      // Project APIs must never bounce credentials to another origin or return
      // browser cookies. Only their response body and content type are forwarded.
      if (result.status >= 300 && result.status < 400)
        throw new Error("Redirect rejected");
      response.writeHead(result.status, {
        "Content-Type":
          result.headers.get("content-type") ?? "application/json",
      });
      response.end(Buffer.from(await result.arrayBuffer()));
    } catch {
      response
        .writeHead(403, { "Content-Type": "application/json" })
        .end(JSON.stringify({ error: "runtime-request-rejected" }));
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return {
    sessionId,
    url: `http://127.0.0.1:${server.address().port}`,
    capability,
    async close() {
      if (closed) return;
      closed = true;
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      await runtimeCall(binding, { operation: "end", proof, sessionId });
    },
  };
}

export async function launchAgent(binding, vault, command, args) {
  const runtime = await openRuntime(binding, vault, command);
  const env = {
    ...process.env,
    ND_AGENT_URL: runtime.url,
    ND_AGENT_CAPABILITY: runtime.capability,
    ND_AGENT_SESSION_ID: runtime.sessionId,
    ND_AGENT_PROJECT_ID: binding.projectId,
    ND_AGENT_IDENTITY_ID: binding.identityId,
  };
  for (const name of Object.keys(env))
    if (/^NEXUSDASH_.*(?:KEY|TOKEN)|^ND_AGENT_(?:SECRET|TOKEN)/i.test(name))
      delete env[name];
  try {
    // shell:false preserves command boundaries; Windows users pass the actual
    // executable (or node plus a CLI entrypoint), never an interpolated command.
    return await new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        env,
        stdio: "inherit",
        shell: false,
        windowsHide: true,
      });
      const stop = () => child.kill();
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
      const cleanup = () => {
        process.removeListener("SIGINT", stop);
        process.removeListener("SIGTERM", stop);
      };
      child.once("error", (error) => {
        cleanup();
        reject(error);
      });
      child.once("exit", (code) => {
        cleanup();
        resolve(code ?? 1);
      });
    });
  } finally {
    await runtime.close();
  }
}
