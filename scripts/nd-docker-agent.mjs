#!/usr/bin/env node
import { readFile, open, unlink, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { DockerBroker } from "./agent-runtime/docker-broker.mjs";
import { createVault } from "./agent-runtime/vault.mjs";

const [configFile, flag] = process.argv.slice(2);
if (!configFile || (flag && flag !== "--create")) throw new Error("Usage: node scripts/nd-docker-agent.mjs CONFIG.json [--create]");
const config = JSON.parse(await readFile(configFile, "utf8"));
const stateDirectory = resolve(config.stateDirectory);
await mkdir(stateDirectory, { recursive: true, mode: 0o700 });
const lockPath = join(stateDirectory, "broker.lock");
// A crashed broker leaves this lock intentionally: inspect/stop the old process
// before explicitly removing it. Two brokers must never share transport files.
const lock = await open(lockPath, "wx", 0o600);
const broker = new DockerBroker(config, createVault());
let timer;
let closing = false;
async function stop() {
  if (closing) return;
  closing = true;
  clearTimeout(timer);
  await broker.close();
  await lock.close();
  await unlink(lockPath);
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
  process.once("SIGINT", () => void stop());
  process.once("SIGTERM", () => void stop());
  console.log("Docker identity broker ready. Stop with Ctrl+C; worker containers remain operator-managed.");
} catch {
  await stop();
  console.error("Broker startup failed. Check configuration, TLS, vault and Docker; no credential fallback was attempted.");
  process.exitCode = 1;
}
