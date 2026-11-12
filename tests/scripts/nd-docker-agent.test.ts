import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, expect, test } from "vitest";

const run = promisify(execFile);
const script = resolve("scripts/nd-docker-agent.mjs");
const folders: string[] = [];
afterEach(async () => { await Promise.all(folders.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

function config(stateDirectory: string, url = "https://host.docker.internal:4443") {
  return JSON.stringify({
    url, keyFile: join(stateDirectory, "key.pem"), certFile: join(stateDirectory, "cert.pem"), stateDirectory,
    workers: [{ name: "one", image: "node:24", command: ["sleep", "infinity"],
      binding: { base: "https://nexus-dash.app", projectId: "project", identityId: "oscar" } }],
  });
}

async function start(configFile: string) {
  return run(process.execPath, [script, configFile], { windowsHide: true, timeout: 30_000 })
    .then(() => null, error => error as { code: number; stderr: string });
}

test("a startup failure removes broker.lock and reports the cause", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nd-broker-cli-"));
  folders.push(directory);
  // Corrupt journal: initialization fails before transport directories exist.
  await writeFile(join(directory, "sessions.json"), "not-json");
  const configFile = join(directory, "config.json");
  await writeFile(configFile, config(directory));
  const failure = await start(configFile);
  expect(failure).not.toBeNull();
  expect(failure!.code).toBe(1);
  expect(failure!.stderr).toContain("Broker startup failed");
  await expect(readFile(join(directory, "broker.lock"), "utf8")).rejects.toThrow();
}, 20_000);

test("invalid configuration is rejected before broker.lock is taken", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nd-broker-cli-"));
  folders.push(directory);
  const configFile = join(directory, "config.json");
  await writeFile(configFile, config(directory, "http://host.docker.internal:4443"));
  const failure = await start(configFile);
  expect(failure).not.toBeNull();
  expect(failure!.code).toBe(1);
  await expect(readFile(join(directory, "broker.lock"), "utf8")).rejects.toThrow();
}, 20_000);
