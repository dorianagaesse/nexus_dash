import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { expect, test } from "vitest";

import { taskCreateContract, taskUpdateContract } from "@/lib/task-contracts";

test("legacy acceptance stays boolean while parse returns normalized commands", () => {
  const create = { title: "Valid task", label: 123 };
  expect(taskCreateContract.is(create)).toBe(true);
  expect(taskCreateContract.parse(create)).toMatchObject({
    ok: true,
    data: { title: "Valid task", labels: [] },
  });
  const update = { labels: 123 };
  expect(taskUpdateContract.is(update)).toBe(true);
  expect(taskUpdateContract.parse(update)).toMatchObject({
    ok: true,
    data: { labels: { labels: [] } },
  });
});

test("schema acceptance cannot narrow raw inputs and command inference stays intact", () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const config = ts.readConfigFile(path.join(root, "tsconfig.json"), ts.sys.readFile);
  expect(config.error).toBeUndefined();
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  expect(parsed.errors).toEqual([]);
  const program = ts.createProgram({
    rootNames: [path.join(root, "tests/types/task-contracts.ts")],
    options: { ...parsed.options, incremental: false, noEmit: true },
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  expect(diagnostics.map((diagnostic) =>
    ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
  )).toEqual([]);
}, 30_000);
