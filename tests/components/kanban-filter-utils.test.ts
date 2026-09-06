import { describe, expect, test } from "vitest";

import {
  NO_EPIC_FILTER_VALUE,
  applyFilteredTaskDrop,
  buildKanbanSearchRevision,
  filterKanbanColumns,
  taskMatchesEpicFilters,
  taskMatchesSelectedLabels,
} from "@/components/kanban/kanban-filter-utils";
import type { KanbanTask } from "@/components/kanban-board-types";
import type { TaskColumns } from "@/components/kanban-board-utils";
import type { TaskStatus } from "@/lib/task-status";

interface TestTask {
  id: string;
  status: TaskStatus;
  labels: string[];
  epic: { id: string; name: string } | null;
}

function task(
  id: string,
  status: TaskStatus = "Backlog",
  labels: string[] = [],
  epicId: string | null = null
): TestTask {
  return {
    id,
    status,
    labels,
    epic: epicId ? { id: epicId, name: epicId } : null,
  };
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

describe("buildKanbanSearchRevision", () => {
  test("refreshes for searchable mutations but not pure reorders", () => {
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
});

describe("taskMatchesSelectedLabels", () => {
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
});

describe("taskMatchesEpicFilters", () => {
  test("matches any selected Epic with OR semantics and honors the No epic sentinel", () => {
    const selected = new Set(["epic-a", "epic-b", NO_EPIC_FILTER_VALUE]);

    expect(taskMatchesEpicFilters(task("a", "Backlog", [], "epic-a"), selected)).toBe(
      true
    );
    expect(taskMatchesEpicFilters(task("b", "Backlog", [], "epic-b"), selected)).toBe(
      true
    );
    expect(taskMatchesEpicFilters(task("none", "Backlog"), selected)).toBe(true);
    expect(taskMatchesEpicFilters(task("c", "Backlog", [], "epic-c"), selected)).toBe(
      false
    );
    expect(
      taskMatchesEpicFilters(task("all", "Backlog", [], "epic-c"), new Set())
    ).toBe(true);
  });

  test("treats tasks without an epic as No epic only", () => {
    const withoutNoEpic = new Set(["epic-a"]);
    expect(taskMatchesEpicFilters(task("unassigned", "Backlog"), withoutNoEpic)).toBe(
      false
    );
    expect(
      taskMatchesEpicFilters(
        task("unassigned", "Backlog"),
        new Set([NO_EPIC_FILTER_VALUE])
      )
    ).toBe(true);
  });
});

describe("filterKanbanColumns", () => {
  test("returns the original columns when no filters are active", () => {
    const fullColumns = columns({
      Backlog: [task("task-a", "Backlog", ["Frontend"], "epic-a")],
    });

    expect(filterKanbanColumns(fullColumns, null, new Set(), new Set())).toBe(
      fullColumns
    );
  });

  test("filters every active column without changing task order", () => {
    const fullColumns = columns({
      Backlog: [
        task("hidden-before", "Backlog", [], "epic-b"),
        task("visible-a", "Backlog", [], "epic-a"),
        task("unassigned", "Backlog"),
        task("visible-b", "Backlog", [], "epic-a"),
      ],
      Done: [task("done-a", "Done", [], "epic-a")],
    });

    const filtered = filterKanbanColumns(
      fullColumns,
      null,
      new Set(),
      new Set(["epic-a"])
    );

    expect(filtered.Backlog.map(({ id }) => id)).toEqual(["visible-a", "visible-b"]);
    expect(filtered.Done.map(({ id }) => id)).toEqual(["done-a"]);
    expect(fullColumns.Backlog.map(({ id }) => id)).toEqual([
      "hidden-before",
      "visible-a",
      "unassigned",
      "visible-b",
    ]);
  });

  test("keeps only epic-less tasks when No epic is selected", () => {
    const fullColumns = columns({
      Backlog: [task("with-epic", "Backlog", [], "epic-a"), task("unassigned", "Backlog")],
      "In Progress": [task("done-none", "In Progress")],
    });

    const filtered = filterKanbanColumns(
      fullColumns,
      null,
      new Set(),
      new Set([NO_EPIC_FILTER_VALUE])
    );

    expect(filtered.Backlog.map(({ id }) => id)).toEqual(["unassigned"]);
    expect(filtered["In Progress"].map(({ id }) => id)).toEqual(["done-none"]);
  });

  test("combines search ids, labels, and epics with AND-of-groups semantics", () => {
    const fullColumns = columns({
      Backlog: [
        task("all-match", "Backlog", ["Frontend", "Urgent"], "epic-a"),
        task("no-search", "Backlog", ["Frontend", "Urgent"], "epic-a"),
        task("no-label", "Backlog", ["Frontend"], "epic-a"),
        task("no-epic", "Backlog", ["Frontend", "Urgent"], "epic-b"),
      ],
    });

    const filtered = filterKanbanColumns(
      fullColumns,
      new Set(["all-match", "no-label", "no-epic"]),
      new Set(["Frontend", "Urgent"]),
      new Set(["epic-a"])
    );

    expect(filtered.Backlog.map(({ id }) => id)).toEqual(["all-match"]);
  });
});

describe("applyFilteredTaskDrop", () => {
  test("inserts before a visible destination anchor while hidden tasks keep order", () => {
    const fullColumns = columns({
      Backlog: [task("moved", "Backlog", [], "epic-a")],
      "In Progress": [
        task("hidden-before", "In Progress", [], "epic-b"),
        task("visible-first", "In Progress", [], "epic-a"),
        task("hidden-middle", "In Progress", [], "epic-b"),
        task("visible-last", "In Progress", [], "epic-a"),
        task("hidden-after", "In Progress", [], "epic-b"),
      ],
    });
    const visibleColumns = filterKanbanColumns(
      fullColumns,
      null,
      new Set(),
      new Set(["epic-a"])
    );

    const result = applyFilteredTaskDrop({
      columns: fullColumns,
      visibleColumns,
      source: { status: "Backlog", index: 0 },
      destination: { status: "In Progress", index: 1 },
      mapMovedTask: (movedTask, status) => ({ ...movedTask, status }),
    });

    expect(result?.columns["In Progress"].map(({ id }) => id)).toEqual([
      "hidden-before",
      "visible-first",
      "hidden-middle",
      "moved",
      "visible-last",
      "hidden-after",
    ]);
    expect(result?.columns.Backlog).toEqual([]);
    expect(result?.columns["In Progress"][3]?.status).toBe("In Progress");
  });

  test("inserts after the last visible task but before hidden trailing tasks", () => {
    const fullColumns = columns({
      Backlog: [task("moved", "Backlog", [], "epic-a")],
      Done: [
        task("visible", "Done", [], "epic-a"),
        task("hidden-trailing", "Done", [], "epic-b"),
      ],
    });
    const visibleColumns = filterKanbanColumns(
      fullColumns,
      null,
      new Set(),
      new Set(["epic-a"])
    );

    const result = applyFilteredTaskDrop({
      columns: fullColumns,
      visibleColumns,
      source: { status: "Backlog", index: 0 },
      destination: { status: "Done", index: 1 },
      mapMovedTask: (movedTask, status) => ({ ...movedTask, status }),
    });

    expect(result?.columns.Done.map(({ id }) => id)).toEqual([
      "visible",
      "moved",
      "hidden-trailing",
    ]);
  });

  test("appends to the full destination when it has no visible task", () => {
    const fullColumns = columns({
      Backlog: [task("moved", "Backlog", [], "epic-a")],
      Blocked: [
        task("hidden-first", "Blocked", [], "epic-b"),
        task("hidden-last", "Blocked", [], "epic-b"),
      ],
    });
    const visibleColumns = filterKanbanColumns(
      fullColumns,
      null,
      new Set(),
      new Set(["epic-a"])
    );

    const result = applyFilteredTaskDrop({
      columns: fullColumns,
      visibleColumns,
      source: { status: "Backlog", index: 0 },
      destination: { status: "Blocked", index: 0 },
      mapMovedTask: (movedTask, status) => ({ ...movedTask, status }),
    });

    expect(result?.columns.Blocked.map(({ id }) => id)).toEqual([
      "hidden-first",
      "hidden-last",
      "moved",
    ]);
  });

  test("rejects stale visible source indices", () => {
    const fullColumns = columns({ Backlog: [task("source")] });
    expect(
      applyFilteredTaskDrop({
        columns: fullColumns,
        visibleColumns: columns(),
        source: { status: "Backlog", index: 0 },
        destination: { status: "Done", index: 0 },
        mapMovedTask: (entry) => entry,
      })
    ).toBeNull();

    expect(
      applyFilteredTaskDrop({
        columns: columns(),
        visibleColumns: columns({ Backlog: [task("missing")] }),
        source: { status: "Backlog", index: 0 },
        destination: { status: "Done", index: 0 },
        mapMovedTask: (entry) => entry,
      })
    ).toBeNull();
  });
});
