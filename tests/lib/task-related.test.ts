import { describe, expect, test } from "vitest";

import {
  buildCanonicalTaskRelation,
  mergeRelatedTaskSummaries,
  normalizeRelatedTaskIds,
} from "@/lib/task-related";

describe("task-related", () => {
  test("normalizes IDs and builds one canonical pair", () => {
    expect(normalizeRelatedTaskIds([" task-b ", "task-b", "", "task-a"])).toEqual([
      "task-b",
      "task-a",
    ]);
    expect(buildCanonicalTaskRelation("task-z", "task-a")).toEqual({
      leftTaskId: "task-a",
      rightTaskId: "task-z",
    });
  });

  test("merges incoming and outgoing relations into one sorted summary list", () => {
    expect(
      mergeRelatedTaskSummaries({
        outgoingRelations: [
          {
            rightTask: {
              id: "task-c",
              title: "Charlie",
              status: "Done",
              archivedAt: new Date("2026-07-29T08:00:00.000Z"),
            },
          },
        ],
        incomingRelations: [
          {
            leftTask: {
              id: "task-a",
              title: "Alpha",
              status: "Backlog",
              archivedAt: null,
            },
          },
          {
            leftTask: {
              id: "task-c",
              title: "Charlie duplicate",
              status: "Done",
              archivedAt: new Date("2026-07-29T08:00:00.000Z"),
            },
          },
        ],
      })
    ).toEqual([
      {
        id: "task-a",
        title: "Alpha",
        status: "Backlog",
        archivedAt: null,
      },
      {
        id: "task-c",
        title: "Charlie",
        status: "Done",
        archivedAt: "2026-07-29T08:00:00.000Z",
      },
    ]);
  });
});

