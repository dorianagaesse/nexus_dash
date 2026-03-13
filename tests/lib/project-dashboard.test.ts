import { describe, expect, test } from "vitest";

import {
  countUpcomingEventsThisWeek,
  formatUpcomingEventsLabel,
} from "@/lib/project-dashboard";

describe("project-dashboard helpers", () => {
  test("counts only events that have not started yet", () => {
    const now = new Date("2026-03-13T10:00:00.000Z");

    const result = countUpcomingEventsThisWeek(
      [
        {
          id: "past",
          summary: "Past",
          start: "2026-03-13T08:00:00.000Z",
          end: "2026-03-13T09:00:00.000Z",
          isAllDay: false,
          location: null,
          description: null,
          htmlLink: null,
          status: "confirmed",
        },
        {
          id: "later-today",
          summary: "Later today",
          start: "2026-03-13T14:00:00.000Z",
          end: "2026-03-13T15:00:00.000Z",
          isAllDay: false,
          location: null,
          description: null,
          htmlLink: null,
          status: "confirmed",
        },
        {
          id: "next-day",
          summary: "Next day",
          start: "2026-03-14T09:00:00.000Z",
          end: "2026-03-14T10:00:00.000Z",
          isAllDay: false,
          location: null,
          description: null,
          htmlLink: null,
          status: "confirmed",
        },
      ],
      now
    );

    expect(result).toBe(2);
  });

  test("formats upcoming event labels for the dashboard", () => {
    expect(formatUpcomingEventsLabel(null)).toBe("This week unavailable");
    expect(formatUpcomingEventsLabel(0)).toBe("No events to come");
    expect(formatUpcomingEventsLabel(1)).toBe("1 event to come");
    expect(formatUpcomingEventsLabel(5)).toBe("5 events to come");
  });
});
