import { describe, expect, test } from "vitest";

import {
  NO_EPIC_FILTER_VALUE,
  applyFilteredTaskDrop,
  filterTaskColumnsByEpic,
  taskMatchesEpicFilters,
} from "@/components/kanban/kanban-epic-filter-utils";
import type { TaskColumns } from "@/components/kanban-board-utils";
import type { TaskStatus } from "@/lib/task-status";

interface TestTask {
  id: string;
  status: TaskStatus;
  epic: { id: string; name: string } | null;
}

function task(
  id: string,
  status: TaskStatus,
  epicId: string | null
): TestTask {
  return {
    id,
    status,
    epic: epicId ? { id: epicId, name: epicId } : null,
  };
}

function columns(overrides: Partial<TaskColumns<TestTask>> = {}): TaskColumns<TestTask> {
  return {
    Backlog: [],
    "In Progress": [],
    Blocked: [],
    Done: [],
    ...overrides,
  };
}

describe("Kanban Epic filter utilities", () => {
  test("matches selected Epics with OR semantics and includes No epic in that set", () => {
    const selected = new Set(["epic-a", "epic-b", NO_EPIC_FILTER_VALUE]);

    expect(taskMatchesEpicFilters(task("a", "Backlog", "epic-a"), selected)).toBe(
      true
    );
    expect(taskMatchesEpicFilters(task("b", "Backlog", "epic-b"), selected)).toBe(
      true
    );
    expect(taskMatchesEpicFilters(task("none", "Backlog", null), selected)).toBe(
      true
    );
    expect(taskMatchesEpicFilters(task("c", "Backlog", "epic-c"), selected)).toBe(
      false
    );
    expect(
      taskMatchesEpicFilters(task("all", "Backlog", "epic-c"), new Set())
    ).toBe(true);
  });

  test("filters every active column without changing task order", () => {
    const fullColumns = columns({
      Backlog: [
        task("hidden-before", "Backlog", "epic-b"),
        task("visible-a", "Backlog", "epic-a"),
        task("unassigned", "Backlog", null),
        task("visible-b", "Backlog", "epic-a"),
      ],
      Done: [task("done-a", "Done", "epic-a")],
    });

    const filtered = filterTaskColumnsByEpic(fullColumns, new Set(["epic-a"]));

    expect(filtered.Backlog.map(({ id }) => id)).toEqual([
      "visible-a",
      "visible-b",
    ]);
    expect(filtered.Done.map(({ id }) => id)).toEqual(["done-a"]);
    expect(fullColumns.Backlog.map(({ id }) => id)).toEqual([
      "hidden-before",
      "visible-a",
      "unassigned",
      "visible-b",
    ]);
  });

  test("inserts before a visible destination anchor while hidden tasks keep order", () => {
    const fullColumns = columns({
      Backlog: [task("moved", "Backlog", "epic-a")],
      "In Progress": [
        task("hidden-before", "In Progress", "epic-b"),
        task("visible-first", "In Progress", "epic-a"),
        task("hidden-middle", "In Progress", "epic-b"),
        task("visible-last", "In Progress", "epic-a"),
        task("hidden-after", "In Progress", "epic-b"),
      ],
    });
    const visibleColumns = filterTaskColumnsByEpic(
      fullColumns,
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
      Backlog: [task("moved", "Backlog", "epic-a")],
      Done: [
        task("visible", "Done", "epic-a"),
        task("hidden-trailing", "Done", "epic-b"),
      ],
    });
    const visibleColumns = filterTaskColumnsByEpic(
      fullColumns,
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
      Backlog: [task("moved", "Backlog", "epic-a")],
      Blocked: [
        task("hidden-first", "Blocked", "epic-b"),
        task("hidden-last", "Blocked", "epic-b"),
      ],
    });
    const visibleColumns = filterTaskColumnsByEpic(
      fullColumns,
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
});

