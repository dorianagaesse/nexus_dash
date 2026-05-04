#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import process from "node:process";

function run(label, command, args, options = {}) {
  console.log(`[local-db-reset] ${label}`);
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
  });

  if (result.error) {
    throw new Error(`${label} failed to start: ${result.error.message}`);
  }

  if (result.status !== 0 && !options.allowFailure) {
    const details = options.capture
      ? `\n${result.stdout ?? ""}${result.stderr ?? ""}`.trimEnd()
      : "";
    throw new Error(`${label} failed with status ${result.status}.${details}`);
  }

  return result;
}

function readPostgresVolumeName() {
  const result = run("Read Docker Compose config", "docker", [
    "compose",
    "config",
    "--format",
    "json",
  ], { capture: true });

  const config = JSON.parse(result.stdout);
  return (
    config?.volumes?.postgres_data?.name ||
    `${config?.name || "nexusdash"}_postgres_data`
  );
}

try {
  const volumeName = readPostgresVolumeName();
  run("Remove local PostgreSQL container", "docker", [
    "compose",
    "rm",
    "--stop",
    "-f",
    "postgres",
  ]);
  const volumeInspect = run("Check local PostgreSQL volume", "docker", [
    "volume",
    "inspect",
    volumeName,
  ], { capture: true, allowFailure: true });
  if (volumeInspect.status === 0) {
    run("Remove local PostgreSQL volume", "docker", [
      "volume",
      "rm",
      volumeName,
    ]);
  } else {
    console.log(`[local-db-reset] Volume already absent (${volumeName}).`);
  }
  run("Start fresh local PostgreSQL", "docker", [
    "compose",
    "up",
    "-d",
    "--wait",
    "postgres",
  ]);
  console.log(`[local-db-reset] Reset complete (${volumeName}).`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
