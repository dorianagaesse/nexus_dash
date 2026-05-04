#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import process from "node:process";

const MIN_NODE_RANGES = [
  { major: 20, minor: 19 },
  { major: 22, minor: 13 },
  { major: 24, minor: 0 },
];

const DEFAULT_DATABASE_URL =
  process.env.LOCAL_DATABASE_URL ||
  `postgresql://postgres:postgres@127.0.0.1:${process.env.POSTGRES_PORT || "5432"}/nexusdash?schema=public`;

const commonEnv = {
  ...process.env,
  DATABASE_URL: process.env.DATABASE_URL || DEFAULT_DATABASE_URL,
  DIRECT_URL: process.env.DIRECT_URL || process.env.DATABASE_URL || DEFAULT_DATABASE_URL,
  AGENT_TOKEN_SIGNING_SECRET:
    process.env.AGENT_TOKEN_SIGNING_SECRET ||
    "local-placeholder-agent-token-signing-secret-0123456789",
  RESEND_API_KEY: process.env.RESEND_API_KEY || "local-placeholder-resend-key",
  STORAGE_PROVIDER: process.env.STORAGE_PROVIDER || "local",
};

function commandName(baseName) {
  return baseName;
}

function parseNodeVersion() {
  const match = process.versions.node.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return null;
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function isSupportedNodeVersion(version) {
  if (!version) {
    return false;
  }

  return MIN_NODE_RANGES.some((range) => {
    if (range.major === 24) {
      return version.major >= 24;
    }

    return version.major === range.major && version.minor >= range.minor;
  });
}

function run(label, command, args, env = commonEnv) {
  console.log(`\n[local-validation] ${label}`);
  const spawnCommand = process.platform === "win32" ? "cmd.exe" : command;
  const spawnArgs =
    process.platform === "win32" ? ["/d", "/s", "/c", command, ...args] : args;
  const result = spawnSync(spawnCommand, spawnArgs, {
    env,
    stdio: "inherit",
  });

  if (result.error) {
    throw new Error(`${label} failed to start: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const status = result.status ?? result.signal ?? "unknown";
    throw new Error(`${label} failed with status ${status}.`);
  }
}

const nodeVersion = parseNodeVersion();
if (!isSupportedNodeVersion(nodeVersion)) {
  console.error(
    `Unsupported Node.js ${process.versions.node}. Use Node 20.19+, 22.13+, or 24+.`
  );
  process.exit(1);
}

try {
  run("Start local PostgreSQL", "docker", [
    "compose",
    "up",
    "-d",
    "--wait",
    "postgres",
  ]);
  run("Install dependencies", commandName("npm"), ["ci"]);
  run("Generate Prisma client", commandName("npx"), ["prisma", "generate"]);
  run("Apply Prisma migrations", commandName("npm"), ["run", "db:migrate"]);
  run("Lint", commandName("npm"), ["run", "lint"]);
  run("Unit/API tests", commandName("npm"), ["test"]);
  run("Coverage", commandName("npm"), ["run", "test:coverage"]);
  run("Production build", commandName("npm"), ["run", "build"]);
  run("Install Playwright Chromium", commandName("npx"), [
    "playwright",
    "install",
    "chromium",
  ]);
  run("Playwright smoke", commandName("npm"), ["run", "test:e2e"], {
    ...commonEnv,
    NODE_ENV: "test",
  });

  console.log("\n[local-validation] Complete.");
} catch (error) {
  console.error(
    error instanceof Error ? `\n[local-validation] ${error.message}` : error
  );
  process.exit(1);
}
