import { describe, expect, test } from "vitest";

import {
  formatTaskDeadlineDate,
  formatTaskDeadlineForDisplay,
  getLocalCalendarDateString,
  getTaskDeadlineDayDelta,
  getTaskDeadlineUrgency,
  parseTaskDeadlineDate,
} from "@/lib/task-deadline";

describe("task-deadline helpers", () => {
  test("parses and formats valid date-only deadlines", () => {
    const parsed = parseTaskDeadlineDate("2026-04-24");

    expect(parsed).toBeInstanceOf(Date);
    expect(parsed?.toISOString()).toBe("2026-04-24T00:00:00.000Z");
    expect(formatTaskDeadlineDate(parsed)).toBe("2026-04-24");
  });

  test("rejects invalid date-only deadlines", () => {
    expect(parseTaskDeadlineDate("2026-02-30")).toBeNull();
    expect(formatTaskDeadlineDate("not-a-date")).toBeNull();
  });

  test("uses the local calendar day when building comparison strings", () => {
    expect(getLocalCalendarDateString(new Date(2026, 3, 20, 23, 45, 0))).toBe(
      "2026-04-20"
    );
  });

  test("computes task deadline deltas in whole calendar days", () => {
    const now = new Date(2026, 3, 20, 12, 0, 0);

    expect(getTaskDeadlineDayDelta("2026-04-20", now)).toBe(0);
    expect(getTaskDeadlineDayDelta("2026-04-22", now)).toBe(2);
    expect(getTaskDeadlineDayDelta("2026-04-18", now)).toBe(-2);
  });

  test("classifies urgency for active tasks only", () => {
    const now = new Date(2026, 3, 20, 12, 0, 0);

    expect(
      getTaskDeadlineUrgency({
        deadlineDate: "2026-04-18",
        status: "In Progress",
        archivedAt: null,
        now,
      })
    ).toBe("overdue");
    expect(
      getTaskDeadlineUrgency({
        deadlineDate: "2026-04-22",
        status: "Blocked",
        archivedAt: null,
        now,
      })
    ).toBe("soon");
    expect(
      getTaskDeadlineUrgency({
        deadlineDate: "2026-04-29",
        status: "Backlog",
        archivedAt: null,
        now,
      })
    ).toBe("none");
    expect(
      getTaskDeadlineUrgency({
        deadlineDate: "2026-04-18",
        status: "Done",
        archivedAt: null,
        now,
      })
    ).toBe("none");
  });

  test("formats stored deadlines for display", () => {
    expect(formatTaskDeadlineForDisplay("2026-04-24", "en-US")).toBe("Apr 24, 2026");
  });
});
