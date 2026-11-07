import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { beforeAll, describe, expect, test } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));
const eslint = new ESLint({ cwd: root });

// Loading the repository's Next/TypeScript plugins is slower than a single lint.
beforeAll(async () => {
  await eslint.calculateConfigForFile("lib/task-boundary-probe.ts");
}, 30_000);

async function importViolations(filePath: string, source: string) {
  const [result] = await eslint.lintText(source, { filePath });
  expect(result.fatalErrorCount).toBe(0);
  return result.messages.filter(message => message.ruleId === "no-restricted-imports");
}

describe("Task import boundaries", () => {
  test.each([
    ["lib/task-boundary-probe.ts", 'import "node:crypto";'],
    ["lib/task-boundary-probe.ts", 'import "node:fs/promises";'],
    ["lib/task-boundary-probe.ts", 'import "fs";'],
    ["lib/task-boundary-probe.ts", 'import "fs/promises";'],
    ["lib/task-boundary-probe.ts", 'import "server-only";'],
    ["lib/task-boundary-probe.ts", 'import "@/lib/services/account-security-policy";'],
    ["lib/task-boundary-probe.ts", 'import "@/app/actions";'],
    ["lib/task-boundary-probe.ts", 'import "@/components/kanban-board";'],
    ["app/api/boundary-probe/route.ts", 'import "@/lib/services/tasks/task-data";'],
    ["components/boundary-probe.tsx", 'import "@/lib/services/tasks";'],
    ["components/boundary-probe.tsx", 'import "../lib/services/tasks/task-data";'],
    ["components/kanban-board-probe.tsx", 'import "@/lib/services/project-task-service";'],
    ["components/kanban/hooks/boundary-probe.ts", 'import "@/lib/services/project-task-service";'],
    ["lib/services/tasks/boundary-probe.ts", 'import "@/lib/prisma";'],
    ["app/api/boundary-probe/route.ts", 'import "@/lib/prisma";'],
  ])("rejects forbidden imports in %s: %s", async (filePath, source) => {
    expect(await importViolations(filePath, source)).not.toEqual([]);
  });

  test.each([
    ["lib/task-boundary-probe.ts", 'import "@/lib/username-discriminator";'],
    ["app/api/boundary-probe/route.ts", 'import "@/lib/services/project-task-service";'],
    ["app/projects/boundary-probe/page.tsx", 'import "@/lib/services/project-service";'],
    ["components/kanban-board-probe.tsx", 'import "@/lib/task-contracts";'],
    ["components/project-boundary-probe.tsx", 'import type { ProjectSummary } from "@/lib/services/project-service"; export type Summary = ProjectSummary;'],
    ["lib/services/tasks/boundary-probe.ts", 'import type { DbClient } from "@/lib/services/rls-context"; export type Client = DbClient;'],
    ["lib/services/boundary-probe.ts", 'import "@/lib/prisma";'],
  ])("permits supported imports in %s: %s", async (filePath, source) => {
    expect(await importViolations(filePath, source)).toEqual([]);
  });
});
