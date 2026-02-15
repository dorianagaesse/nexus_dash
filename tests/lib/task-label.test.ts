import { describe, expect, test } from "vitest";

import { CONTEXT_CARD_COLORS } from "@/lib/context-card-colors";
import {
  MAX_TASK_LABELS,
  getTaskLabelColor,
  getTaskLabelsFromStorage,
  normalizeTaskLabel,
  normalizeTaskLabels,
  parseTaskLabelsJson,
  serializeTaskLabels,
} from "@/lib/task-label";

describe("task-label", () => {
  test("normalizes single label whitespace and length", () => {
    expect(normalizeTaskLabel("  hello   world  ")).toBe("hello world");
    expect(normalizeTaskLabel("x".repeat(100)).length).toBe(40);
  });

  test("normalizes multiple labels, removes duplicates, and respects max size", () => {
    const source = [
      "  A  ",
      "a",
      "B",
      "C",
      "D",
      "E",
      "F",
      "G",
      "H",
      "I",
    ];

    const normalized = normalizeTaskLabels(source);
    expect(normalized).toEqual(["A", "B", "C", "D", "E", "F", "G", "H"]);
    expect(normalized.length).toBe(MAX_TASK_LABELS);
  });

  test("parses label json safely", () => {
    expect(parseTaskLabelsJson("")).toEqual([]);
    expect(parseTaskLabelsJson("not-json")).toEqual([]);
    expect(parseTaskLabelsJson("{}")).toEqual([]);
    expect(parseTaskLabelsJson(JSON.stringify(["A", 1, "a", "B"]))).toEqual([
      "A",
      "B",
    ]);
  });

  test("serializes only valid normalized labels", () => {
    expect(serializeTaskLabels(["", "  "])).toBeNull();
    expect(serializeTaskLabels([" alpha ", "ALPHA", "beta"])).toBe(
      JSON.stringify(["alpha", "beta"])
    );
  });

  test("resolves labels from json first then legacy fallback", () => {
    expect(getTaskLabelsFromStorage(JSON.stringify(["json"]), "legacy")).toEqual([
      "json",
    ]);
    expect(getTaskLabelsFromStorage(null, "legacy")).toEqual(["legacy"]);
    expect(getTaskLabelsFromStorage(null, null)).toEqual([]);
  });

  test("returns deterministic palette color from label", () => {
    const color = getTaskLabelColor("critical");
    expect(getTaskLabelColor("critical")).toBe(color);
    expect(CONTEXT_CARD_COLORS).toContain(color);
  });
});
