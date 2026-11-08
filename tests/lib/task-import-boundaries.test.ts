import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { beforeAll, describe, expect, test } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));
const eslint = new ESLint({ cwd: root });

// Loading Next/TypeScript plugins under coverage can be slow on shared hosts.
// This allowance covers configuration startup only; individual assertions keep their timeout.
beforeAll(async () => {
  await eslint.calculateConfigForFile("lib/task-boundary-probe.ts");
}, 60_000);

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

describe("Task persistence boundaries", () => {
  async function violations(filePath: string, source: string) {
    const [result] = await eslint.lintText(source, { filePath });
    expect(result.fatalErrorCount).toBe(0);
    return result.messages.filter(message =>
      ["no-restricted-syntax", "no-restricted-imports"].includes(message.ruleId ?? "")
    );
  }

  test.each([
    "lib/services/tasks/task-write-use-cases.ts",
    "lib/services/tasks/task-lifecycle-use-cases.ts",
    "lib/services/tasks/task-policy.ts",
    "lib/services/tasks/task-assignment.ts",
    "lib/services/tasks/task-read-use-cases.ts",
    "lib/services/project-task-search-service.ts",
    "lib/services/project-task-service.ts",
  ])("rejects direct or aliased persistence in %s", async filePath => {
    for (const source of [
      "db.task.findMany({});",
      "otherClient.task.findMany({});",
      "db['task'].update({});",
      "const delegate = client.task; delegate.delete({});",
      "const { task: delegate } = client; delegate.findUnique({});",
      "db.taskRelation.createMany({});",
      "db.taskAssigneeChange.create({});",
      "db.taskBlockedFollowUp.create({});",
      "db.taskAttachment.findMany({});",
      "db.taskComment.findMany({});",
      "db.$queryRaw`SELECT * FROM Task`;",
      "db['$executeRawUnsafe']('DELETE FROM Task');",
    ]) expect(await violations(filePath, source)).not.toEqual([]);
    expect(await violations(filePath, "const { task } = response.data; response.task.title; task.title;")).toEqual([]);
    expect(await violations(filePath,
      'import { loadTaskEditState } from "./task-command-data"; loadTaskEditState(db, taskId, true);'
    )).toEqual([]);
  });

  test.each(["task-command-data", "task-write-data", "task-search-data", "task-dashboard-data", "task-data", "task-persistence"])(
    "allows caller-scoped persistence but prevents global clients and transactions in %s", async name => {
      const filePath = `lib/services/tasks/${name}.ts`;
      expect(await violations(filePath, "db.task.findMany({});")).toEqual([]);
      for (const source of [
        'import { prisma } from "@/lib/prisma";',
        'import { prisma } from "../../prisma";',
        'import { withActorRlsContext } from "@/lib/services/rls-context";',
        "db.$transaction(() => {});",
        "db['$transaction'](() => {});",
      ]) expect(await violations(filePath, source)).not.toEqual([]);
    }
  );

  test("keeps project counts as an explicit exception without reopening dashboard content queries", async () => {
    const filePath = "lib/services/project-service.ts";
    expect(await violations(filePath, "db.task.count({ where: { projectId } });")).toEqual([]);
    expect(await violations(filePath, "db.task.findMany({});")).not.toEqual([]);
    expect(await violations(filePath, "db.project.findFirst({ include: { tasks: { include: { attachments: true } } } });")).not.toEqual([]);
  });

  test("leaves documented cross-domain persistence outside the Task application guard", async () => {
    expect(await violations("lib/services/project-offboarding-service.ts", "db.task.updateMany({});")).toEqual([]);
    expect(await violations("lib/services/project-task-comment-service.ts", "db.taskAttachment.updateMany({});")).toEqual([]);
  });
});
