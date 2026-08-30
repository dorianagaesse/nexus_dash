import { describe, expect, test } from "vitest";

import {
  buildKanbanSearchRevision,
  filterKanbanColumns,
  moveTaskUsingVisibleIndices,
  taskMatchesSelectedLabels,
} from "@/components/kanban/kanban-filter-utils";
import type { KanbanTask } from "@/components/kanban-board-types";
import type { TaskColumns } from "@/components/kanban-board-utils";

interface TestTask {
  id: string;
  labels: string[];
  status: "Backlog" | "In Progress" | "Blocked" | "Done";
}

function task(
  id: string,
  status: TestTask["status"] = "Backlog",
  labels: string[] = []
): TestTask {
  return { id, status, labels };
}

function columns(overrides?: Partial<TaskColumns<TestTask>>): TaskColumns<TestTask> {
  return {
    Backlog: [],
    "In Progress": [],
    Blocked: [],
    Done: [],
    ...overrides,
  };
}

describe("Kanban filter utilities", () => {
  test("refreshes search for searchable mutations but not pure reorders", () => {
    const baseTask = {
      id: "task-a",
      reference: "ND-1",
      title: "Alpha",
      description: null,
      status: "Backlog",
      labels: [],
      epic: null,
      assignee: null,
      blockedFollowUps: [],
      attachments: [],
      relatedTasks: [],
      commentCount: 0,
      archivedAt: null,
      position: 0,
      updatedAt: "2026-08-30T00:00:00.000Z",
    } as unknown as KanbanTask;
    const secondTask = {
      ...baseTask,
      id: "task-b",
      reference: "ND-2",
      title: "Beta",
      position: 1,
    };
    const initialRevision = buildKanbanSearchRevision([baseTask, secondTask]);
    const reorderedRevision = buildKanbanSearchRevision([
      { ...secondTask, position: 0, updatedAt: "2026-08-30T01:00:00.000Z" },
      { ...baseTask, position: 1, updatedAt: "2026-08-30T01:00:00.000Z" },
    ]);
    const commentRevision = buildKanbanSearchRevision([
      { ...baseTask, commentCount: 1 },
      secondTask,
    ]);

    expect(reorderedRevision).toBe(initialRevision);
    expect(commentRevision).not.toBe(initialRevision);
  });

  test("matches every selected label case-insensitively", () => {
    expect(taskMatchesSelectedLabels([], new Set())).toBe(true);
    expect(
      taskMatchesSelectedLabels(
        ["Frontend", "Urgent", "Accessibility"],
        new Set(["frontend", "URGENT"])
      )
    ).toBe(true);
    expect(
      taskMatchesSelectedLabels(
        ["Frontend", "Accessibility"],
        new Set(["Frontend", "Urgent"])
      )
    ).toBe(false);
  });

  test("combines server search IDs and labels with AND semantics", () => {
    const fullColumns = columns({
      Backlog: [
        task("matching", "Backlog", ["Frontend", "Urgent"]),
        task("search-only", "Backlog", ["Frontend"]),
        task("labels-only", "Backlog", ["Frontend", "Urgent"]),
      ],
    });

    const filtered = filterKanbanColumns(
      fullColumns,
      new Set(["matching", "search-only"]),
      new Set(["Frontend", "Urgent"])
    );

    expect(filtered.Backlog.map((entry) => entry.id)).toEqual(["matching"]);
  });

  test("inserts before a visible anchor without moving hidden tasks", () => {
    const fullColumns = columns({
      Backlog: [task("source")],
      "In Progress": [task("visible-a"), task("hidden-a"), task("visible-b")],
    });
    const visibleColumns = columns({
      Backlog: [fullColumns.Backlog[0]],
      "In Progress": [
        fullColumns["In Progress"][0],
        fullColumns["In Progress"][2],
      ],
    });

    const moved = moveTaskUsingVisibleIndices({
      columns: fullColumns,
      visibleColumns,
      sourceStatus: "Backlog",
      sourceIndex: 0,
      destinationStatus: "In Progress",
      destinationIndex: 1,
      transformMovedTask: (entry, status) => ({ ...entry, status }),
    });

    expect(moved?.["In Progress"].map((entry) => entry.id)).toEqual([
      "visible-a",
      "hidden-a",
      "source",
      "visible-b",
    ]);
  });

  test("inserts after the final visible task at the visible end", () => {
    const backlog = [
      task("source"),
      task("hidden-a"),
      task("visible-b"),
      task("hidden-b"),
      task("visible-c"),
      task("hidden-c"),
    ];
    const fullColumns = columns({ Backlog: backlog });
    const visibleColumns = columns({ Backlog: [backlog[0], backlog[2], backlog[4]] });

    const moved = moveTaskUsingVisibleIndices({
      columns: fullColumns,
      visibleColumns,
      sourceStatus: "Backlog",
      sourceIndex: 0,
      destinationStatus: "Backlog",
      destinationIndex: 2,
      transformMovedTask: (entry) => entry,
    });

    expect(moved?.Backlog.map((entry) => entry.id)).toEqual([
      "hidden-a",
      "visible-b",
      "hidden-b",
      "visible-c",
      "source",
      "hidden-c",
    ]);
  });

  test("uses the full-column end when no destination task is visible", () => {
    const fullColumns = columns({
      Backlog: [task("source")],
      Done: [task("hidden-a", "Done"), task("hidden-b", "Done")],
    });
    const visibleColumns = columns({ Backlog: [fullColumns.Backlog[0]] });

    const moved = moveTaskUsingVisibleIndices({
      columns: fullColumns,
      visibleColumns,
      sourceStatus: "Backlog",
      sourceIndex: 0,
      destinationStatus: "Done",
      destinationIndex: 0,
      transformMovedTask: (entry, status) => ({ ...entry, status }),
    });

    expect(moved?.Done.map((entry) => entry.id)).toEqual([
      "hidden-a",
      "hidden-b",
      "source",
    ]);
  });

  test("rejects stale visible source indices", () => {
    const fullColumns = columns({ Backlog: [task("source")] });
    expect(
      moveTaskUsingVisibleIndices({
        columns: fullColumns,
        visibleColumns: columns(),
        sourceStatus: "Backlog",
        sourceIndex: 0,
        destinationStatus: "Done",
        destinationIndex: 0,
        transformMovedTask: (entry) => entry,
      })
    ).toBeNull();

    expect(
      moveTaskUsingVisibleIndices({
        columns: columns(),
        visibleColumns: columns({ Backlog: [task("missing")] }),
        sourceStatus: "Backlog",
        sourceIndex: 0,
        destinationStatus: "Done",
        destinationIndex: 0,
        transformMovedTask: (entry) => entry,
      })
    ).toBeNull();
  });
});
