import { describe, expect, test } from "vitest";

import { calculateEpicProgressPercent, deriveEpicStatus } from "@/lib/epic";

describe("epic helpers", () => {
  test("treats empty epics as ready with zero progress", () => {
    expect(deriveEpicStatus([])).toBe("Ready");
    expect(calculateEpicProgressPercent([])).toBe(0);
  });

  test("treats all backlog tasks as ready", () => {
    expect(
      deriveEpicStatus([
        { status: "Backlog", archivedAt: null },
        { status: "Backlog", archivedAt: null },
      ])
    ).toBe("Ready");
  });

  test("treats any in-progress or blocked task as in progress", () => {
    expect(
      deriveEpicStatus([
        { status: "Backlog", archivedAt: null },
        { status: "In Progress", archivedAt: null },
      ])
    ).toBe("In progress");

    expect(
      deriveEpicStatus([
        { status: "Backlog", archivedAt: null },
        { status: "Blocked", archivedAt: null },
      ])
    ).toBe("In progress");
  });

  test("treats mixed backlog and completed work as in progress", () => {
    expect(
      deriveEpicStatus([
        { status: "Backlog", archivedAt: null },
        { status: "Done", archivedAt: null },
      ])
    ).toBe("In progress");
  });

  test("treats done or archived tasks as completed", () => {
    expect(
      deriveEpicStatus([
        { status: "Done", archivedAt: null },
        { status: "Done", archivedAt: new Date("2026-04-20T08:00:00.000Z") },
      ])
    ).toBe("Completed");

    expect(
      calculateEpicProgressPercent([
        { status: "Backlog", archivedAt: null },
        { status: "Done", archivedAt: null },
        { status: "Done", archivedAt: new Date("2026-04-20T08:00:00.000Z") },
      ])
    ).toBe(67);
  });
});
