import { describe, expect, test } from "vitest";

import {
  parseEventForForm,
  formatCalendarSourceAccount,
  resolveCalendarVisualColor,
  resolvePreferredWriteSourceId,
  toCalendarEventDateTime,
  toDateTimeLocalInputValue,
  type CalendarEventItem,
  type CalendarSourceOption,
} from "@/components/project-calendar-panel-utils";

const SOURCES: CalendarSourceOption[] = [
  {
    id: "source-first",
    connectionId: "connection-1",
    name: "First",
    color: null,
    accountLabel: "one@example.com",
    accountEmail: "one@example.com",
    writable: true,
  },
  {
    id: "source-preferred",
    connectionId: "connection-2",
    name: "Preferred",
    color: null,
    accountLabel: "Workspace account",
    accountEmail: "two@example.com",
    writable: true,
  },
];

describe("resolvePreferredWriteSourceId", () => {
  test("preserves the saved writable target instead of selecting the first source", () => {
    expect(resolvePreferredWriteSourceId(SOURCES, "source-preferred")).toBe(
      "source-preferred"
    );
  });

  test("falls back to the first writable source when the saved target is unavailable", () => {
    expect(resolvePreferredWriteSourceId(SOURCES, "source-missing")).toBe(
      "source-first"
    );
  });
});

describe("calendar source presentation", () => {
  test("uses a valid provider color and a stable fallback for missing colors", () => {
    expect(resolveCalendarVisualColor("source-first", "#A4BDFC")).toBe("#A4BDFC");
    expect(resolveCalendarVisualColor("source-first", null)).toBe(
      resolveCalendarVisualColor("source-first", "invalid")
    );
    expect(resolveCalendarVisualColor("source-first", null)).not.toBe(
      resolveCalendarVisualColor("source-preferred", null)
    );
  });

  test("keeps account identity explicit without duplicating equal email labels", () => {
    expect(formatCalendarSourceAccount(SOURCES[0])).toBe("one@example.com");
    expect(formatCalendarSourceAccount(SOURCES[1])).toBe(
      "Workspace account (two@example.com)"
    );
  });
});

describe("project calendar datetime conversion", () => {
  test("converts a local calendar value to an ISO instant", () => {
    const localDate = new Date(2026, 7, 31, 14, 0, 0, 0);

    expect(toCalendarEventDateTime("2026-08-31T14:00")).toBe(
      localDate.toISOString()
    );
  });

  test("preserves a timed event instant through an edit round-trip", () => {
    const start = new Date(2026, 7, 31, 14, 0, 0, 0);
    const end = new Date(2026, 7, 31, 14, 30, 0, 0);
    const event: CalendarEventItem = {
      id: "event-1",
      summary: "Timezone regression",
      start: start.toISOString(),
      end: end.toISOString(),
      isAllDay: false,
      location: null,
      description: null,
      htmlLink: null,
      status: "confirmed",
      calendarSourceId: "source-first",
      connectionId: "connection-1",
      calendarName: "First",
      calendarColor: null,
      accountLabel: "one@example.com",
      accountEmail: "one@example.com",
      writable: true,
    };

    const form = parseEventForForm(event);

    expect(form.startDateTime).toBe(toDateTimeLocalInputValue(start));
    expect(toCalendarEventDateTime(form.startDateTime)).toBe(event.start);
    expect(toCalendarEventDateTime(form.endDateTime)).toBe(event.end);
  });

  test("rejects invalid local calendar values", () => {
    expect(toCalendarEventDateTime("not-a-date")).toBeNull();
  });
});
