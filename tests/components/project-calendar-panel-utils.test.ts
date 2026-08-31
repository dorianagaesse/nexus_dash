import { describe, expect, test } from "vitest";

import {
  parseEventForForm,
  toCalendarEventDateTime,
  toDateTimeLocalInputValue,
  type CalendarEventItem,
} from "@/components/project-calendar-panel-utils";

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
