import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

const SCRIPT = join(process.cwd(), "scripts", "check-npm-audit.mjs");

const dirs: string[] = [];

function createDir() {
  const dir = mkdtempSync(join(tmpdir(), "nexusdash-npm-audit-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});

function auditPayload(counts: Record<string, number>) {
  return {
    auditReportVersion: 2,
    metadata: {
      vulnerabilities: {
        info: 0,
        low: 0,
        moderate: 0,
        high: 0,
        critical: 0,
        total: 0,
        ...counts,
      },
    },
    vulnerabilities: {},
  };
}

function runAudit(
  dir: string,
  file: string,
  mode: "production" | "full",
  extraArgs: string[] = []
) {
  const statusPath = join(dir, "status.json");
  const summaryPath = join(dir, "summary.md");
  const result = spawnSync(
    process.execPath,
    [
      SCRIPT,
      "--file",
      file,
      "--mode",
      mode,
      "--status",
      statusPath,
      "--summary",
      summaryPath,
      ...extraArgs,
    ],
    { cwd: dir, encoding: "utf8" }
  );

  return {
    result,
    status: JSON.parse(readFileSync(statusPath, "utf8")),
    summary: readFileSync(summaryPath, "utf8"),
  };
}

describe("check-npm-audit", () => {
  test("passes a clean production audit", () => {
    const dir = createDir();
    const file = join(dir, "audit.json");
    writeFileSync(file, JSON.stringify(auditPayload({})));

    const { result, status, summary } = runAudit(dir, file, "production");

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(status.kind).toBe("none");
    expect(summary).toContain("## Production Dependency Audit");
  });

  test("fails production audits with high or critical findings", () => {
    const dir = createDir();
    const file = join(dir, "audit.json");
    writeFileSync(file, JSON.stringify(auditPayload({ high: 2, critical: 1, total: 3 })));

    const { result, status } = runAudit(dir, file, "production");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "High/Critical production vulnerabilities detected: 3"
    );
    expect(status.kind).toBe("findings");
  });

  test("records full-tree findings without failing", () => {
    const dir = createDir();
    const file = join(dir, "audit.json");
    writeFileSync(file, JSON.stringify(auditPayload({ high: 4, moderate: 2, total: 6 })));

    const { result, status, summary } = runAudit(dir, file, "full");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("informational");
    expect(status.kind).toBe("none");
    expect(summary).toContain("- High: `4`");
  });

  test("fails closed on malformed JSON", () => {
    const dir = createDir();
    const file = join(dir, "audit.json");
    writeFileSync(file, "{ not json");

    const { result, status, summary } = runAudit(dir, file, "production");

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Scanner error:");
    expect(result.stderr).toContain("malformed");
    expect(status.kind).toBe("scanner-error");
    expect(summary).toContain("scanner error");
  });

  test("fails closed when the audit file is missing", () => {
    const dir = createDir();

    const { result, status } = runAudit(
      dir,
      join(dir, "missing.json"),
      "production"
    );

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("audit JSON not found");
    expect(status.kind).toBe("scanner-error");
  });

  test("fails closed when npm audit returns an error payload", () => {
    const dir = createDir();
    const file = join(dir, "audit.json");
    writeFileSync(
      file,
      JSON.stringify({
        error: { code: "EAI_AGAIN", summary: "registry unavailable" },
      })
    );

    const { result, status } = runAudit(dir, file, "full");

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("registry unavailable");
    expect(status.kind).toBe("scanner-error");
  });

  test("fails closed when metadata.vulnerabilities is missing", () => {
    const dir = createDir();
    const file = join(dir, "audit.json");
    writeFileSync(file, JSON.stringify({ auditReportVersion: 2 }));

    const { result } = runAudit(dir, file, "production");

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("no metadata.vulnerabilities");
  });

  test("fails closed on an unexpected npm exit code", () => {
    const dir = createDir();
    const file = join(dir, "audit.json");
    writeFileSync(file, JSON.stringify(auditPayload({})));

    const { result } = runAudit(dir, file, "production", ["--npm-exit", "7"]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("unexpected code 7");
  });
});
