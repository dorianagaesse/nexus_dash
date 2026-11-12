#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { request } from "node:https";
import { dirname, join } from "node:path";

try {
  const [method, path, body] = process.argv.slice(2);
  const file = process.env.ND_AGENT_BINDING_FILE;
  if (!file) throw new Error();
  const binding = JSON.parse(await readFile(file, "utf8"));
  const base = new URL(binding.url);
  const target = new URL(path, base);
  const prefix = `/api/projects/${binding.projectId}`;
  if (base.protocol !== "https:" || base.username || base.password || base.pathname !== "/" ||
    !/^[A-Za-z0-9_-]{43}$/.test(binding.capability ?? "") || !path?.startsWith("/") ||
    target.origin !== base.origin || (target.pathname !== prefix && !target.pathname.startsWith(`${prefix}/`)) ||
    !["GET", "POST", "PATCH", "PUT", "DELETE"].includes(method)) throw new Error();
  const ca = await readFile(join(dirname(file), "ca.pem"));
  await new Promise((accept, reject) => {
    const call = request(target, { method, ca, timeout: 35_000,
      headers: { authorization: `Bearer ${binding.capability}`, "Content-Type": "application/json" } }, response => {
      if (response.statusCode >= 300 && response.statusCode < 400) { response.resume(); reject(new Error()); return; }
      process.exitCode = response.statusCode >= 200 && response.statusCode < 300 ? 0 : 1;
      response.pipe(process.stdout);
      response.on("end", accept);
      response.on("error", reject);
    });
    call.on("error", reject);
    call.on("timeout", () => call.destroy(new Error()));
    call.end(body);
  });
} catch {
  console.error("Sandbox access unavailable. Ask the operator to check this execution's binding and authorization.");
  process.exitCode = 1;
}
