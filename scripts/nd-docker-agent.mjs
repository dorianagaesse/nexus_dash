#!/usr/bin/env node
import { readFile, open, unlink, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { DockerBroker } from "./agent-runtime/docker-broker.mjs";
import { createVault } from "./agent-runtime/vault.mjs";

const [configFile, flag] = process.argv.slice(2);
if (!configFile || (flag && flag !== "--create")) throw new Error("Usage: node scripts/nd-docker-agent.mjs CONFIG.json [--create]");
const config = JSON.parse(await readFile(configFile, "utf8"));
// Validate configuration before taking the lock: a bad config must fail without
// leaving a lock that operators would read as a crashed broker.
const broker = new DockerBroker(config, createVault());
const stateDirectory = resolve(config.stateDirectory);
await mkdir(stateDirectory, { recursive: true, mode: 0o700 });
const lockPath = join(stateDirectory, "broker.lock");
// A crashed broker leaves this lock intentionally: inspect/stop the old process
// before explicitly removing it. Two brokers must never share transport files.
const lock = await open(lockPath, "wx", 0o600);
let timer;
let closing = false;
async function stop() {
  if (closing) return;
  closing = true;
  clearTimeout(timer);
  try {
    await broker.close();
  } finally {
    // Lock cleanup must not depend on session or transport cleanup succeeding;
    // otherwise startup failures mask their cause behind a stale lock.
    await lock.close().catch(() => {});
    await unlink(lockPath).catch(() => {});
  }
}
try {
  await broker.initialize();
  if (flag) await broker.createWorkers();
  await broker.listen();
  const tick = async () => {
    if (closing) return;
    try { await broker.reconcile(); } catch { console.error("Broker reconciliation unavailable; access remains closed."); }
    if (!closing) timer = setTimeout(tick, 2000);
  };
  await tick();
  const shutdown = () => void stop().catch(() => console.error("Broker shutdown incomplete; check Docker and the session journal before restarting."));
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  console.log("Docker identity broker ready. Stop with Ctrl+C; worker containers remain operator-managed.");
} catch {
  await stop().catch(() => {});
  console.error("Broker startup failed. Check configuration, TLS, vault and Docker; no credential fallback was attempted.");
  process.exitCode = 1;
}
