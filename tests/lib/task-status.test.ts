import { describe, expect, test } from "vitest";

import { TASK_STATUSES, isTaskStatus } from "@/lib/task-status";

describe("task-status", () => {
  test("exposes supported statuses", () => {
    expect(TASK_STATUSES).toEqual([
      "Backlog",
      "In Progress",
      "Blocked",
      "Done",
    ]);
  });

  test("validates status values", () => {
    expect(isTaskStatus("Backlog")).toBe(true);
    expect(isTaskStatus("Invalid")).toBe(false);
  });
});
