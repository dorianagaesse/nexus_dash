#!/usr/bin/env node
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import process from "node:process";

const EXIT_PASS = 0;
const EXIT_FINDINGS = 1;
const EXIT_SCANNER_ERROR = 2;

const MODES = new Set(["production", "full"]);
const COUNT_KEYS = ["info", "low", "moderate", "high", "critical", "total"];

function usage() {
  console.log(`Usage:
  node scripts/check-npm-audit.mjs --file <audit.json> --mode <production|full> \\
    [--npm-exit <code>] [--summary <path>] [--status <path>]

Validates npm audit JSON and fails closed when the scanner output is missing or
malformed. Exit codes: 0 = pass, 1 = high/critical production findings,
2 = scanner error.

Examples:
  node scripts/check-npm-audit.mjs --file npm-audit-prod.json --mode production
  node scripts/check-npm-audit.mjs --file npm-audit-full.json --mode full`);
}

function parseArgs(argv) {
  const args = {
    file: null,
    mode: "production",
    npmExit: null,
    summary: null,
    status: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];

    switch (flag) {
      case "--file":
        args.file = value;
        index += 1;
        break;
      case "--mode":
        args.mode = value;
        index += 1;
        break;
      case "--npm-exit":
        args.npmExit = Number(value);
        index += 1;
        break;
      case "--summary":
        args.summary = value;
        index += 1;
        break;
      case "--status":
        args.status = value;
        index += 1;
        break;
      case "-h":
      case "--help":
        usage();
        process.exit(EXIT_PASS);
        break;
      default:
        throw new Error(`Unknown argument: ${flag}`);
    }
  }

  if (!args.file) {
    throw new Error("--file is required");
  }

  if (!MODES.has(args.mode)) {
    throw new Error(`--mode must be one of: ${[...MODES].join(", ")}`);
  }

  return args;
}

class ScannerError extends Error {}

function scannerError(message) {
  throw new ScannerError(message);
}

function readVulnerabilityCounts(file) {
  let raw;

  try {
    raw = readFileSync(file, "utf8");
  } catch {
    scannerError(`audit JSON not found at ${file}`);
  }

  if (!raw.trim()) {
    scannerError(`audit JSON at ${file} is empty`);
  }

  let audit;

  try {
    audit = JSON.parse(raw);
  } catch (error) {
    scannerError(`audit JSON at ${file} is malformed: ${error.message}`);
  }

  if (audit?.error) {
    const code = audit.error.code ? ` ${audit.error.code}` : "";
    const summary = audit.error.summary ?? "unknown npm audit error";
    scannerError(`npm audit failed${code}: ${summary}`);
  }

  const counts = audit?.metadata?.vulnerabilities;

  if (!counts || typeof counts !== "object" || Array.isArray(counts)) {
    scannerError(`audit JSON at ${file} has no metadata.vulnerabilities object`);
  }

  for (const key of COUNT_KEYS) {
    if (counts[key] !== undefined && typeof counts[key] !== "number") {
      scannerError(
        `audit JSON at ${file} has a non-numeric metadata.vulnerabilities.${key}`
      );
    }
  }

  return {
    info: counts.info ?? 0,
    low: counts.low ?? 0,
    moderate: counts.moderate ?? 0,
    high: counts.high ?? 0,
    critical: counts.critical ?? 0,
    total: counts.total ?? 0,
  };
}

function appendSummary(path, lines) {
  if (path) {
    appendFileSync(path, `${lines.join("\n")}\n`);
  }
}

function writeStatus(path, status) {
  if (path) {
    writeFileSync(path, `${JSON.stringify(status, null, 2)}\n`);
  }
}

function classify({ file, mode, npmExit }) {
  if (npmExit !== null && !Number.isNaN(npmExit) && ![0, 1].includes(npmExit)) {
    scannerError(`npm audit exited with unexpected code ${npmExit}`);
  }

  const counts = readVulnerabilityCounts(file);
  const highOrCritical = counts.high + counts.critical;

  if (mode === "production" && highOrCritical > 0) {
    return { kind: "findings", counts, highOrCritical };
  }

  return { kind: "none", counts, highOrCritical };
}

function printOutcome({ mode, kind, counts, highOrCritical }, args) {
  const label = mode === "production" ? "Production" : "Full";

  appendSummary(args.summary, [
    `## ${label} Dependency Audit`,
    "",
    `- Critical: \`${counts.critical}\``,
    `- High: \`${counts.high}\``,
    `- Moderate: \`${counts.moderate}\``,
    `- Total: \`${counts.total}\``,
    "",
  ]);

  if (kind === "findings") {
    console.error(
      `High/Critical production vulnerabilities detected: ${highOrCritical}`
    );
    return EXIT_FINDINGS;
  }

  if (mode === "production") {
    console.log("[npm-audit] production audit clean: 0 high/critical");
  } else {
    console.log(
      `[npm-audit] full-tree audit recorded: ${highOrCritical} high/critical (informational)`
    );
  }

  return EXIT_PASS;
}

function main() {
  let args;

  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`[npm-audit] Scanner error: ${error.message}. Failing closed.`);
    return EXIT_SCANNER_ERROR;
  }

  let result;

  try {
    result = classify(args);
  } catch (error) {
    if (!(error instanceof ScannerError)) {
      throw error;
    }

    console.error(
      `[npm-audit] Scanner error: ${error.message}. ` +
        "Audit findings are unknown; failing closed."
    );
    console.error(
      "[npm-audit] Check npm registry availability and the uploaded audit artifacts, " +
        "then re-run the workflow."
    );
    appendSummary(args.summary, [
      `## ${args.mode === "production" ? "Production" : "Full"} Dependency Audit - scanner error`,
      "",
      `- Error: ${error.message}`,
      "- Result: failing closed; findings are unknown",
      "",
    ]);
    writeStatus(args.status, {
      kind: "scanner-error",
      mode: args.mode,
      message: error.message,
    });

    return EXIT_SCANNER_ERROR;
  }

  writeStatus(args.status, {
    kind: result.kind,
    mode: args.mode,
    ...result.counts,
  });

  return printOutcome({ ...result, mode: args.mode }, args);
}

process.exit(main());
