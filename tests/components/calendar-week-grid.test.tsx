import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

import { CalendarWeekGrid } from "@/components/calendar-panel/calendar-week-grid";
import {
  toDateKey,
  type CalendarEventItem,
  type DayEventBucket,
} from "@/components/project-calendar-panel-utils";

const day = new Date(2026, 0, 5);
const allDayEvent: CalendarEventItem = {
  id: "all-day",
  summary: "All-day event",
  start: "2026-01-05",
  end: "2026-01-06",
  isAllDay: true,
  location: null,
  description: null,
  htmlLink: null,
  status: "confirmed",
};
const timedEvent: CalendarEventItem = {
  id: "timed",
  summary: "Timed event",
  start: "2026-01-05T09:00:00.000Z",
  end: "2026-01-05T10:00:00.000Z",
  isAllDay: false,
  location: null,
  description: null,
  htmlLink: null,
  status: "confirmed",
};
const eventsByDay = new Map<string, DayEventBucket>([
  [toDateKey(day), { allDay: [allDayEvent], timed: [timedEvent] }],
]);

describe("CalendarWeekGrid write affordances", () => {
  test("hides every mobile and desktop edit control for read-only calendars", () => {
    const result = renderToStaticMarkup(
      <CalendarWeekGrid
        canWrite={false}
        weekDays={[day]}
        eventsByDay={eventsByDay}
        eventsCount={2}
        onOpenGoogleEvent={vi.fn()}
        onOpenEditEventModal={vi.fn()}
      />
    );

    expect(result).not.toContain('aria-label="Edit calendar event"');
  });

  test("shows edit controls across mobile and desktop layouts when writable", () => {
    const result = renderToStaticMarkup(
      <CalendarWeekGrid
        canWrite
        weekDays={[day]}
        eventsByDay={eventsByDay}
        eventsCount={2}
        onOpenGoogleEvent={vi.fn()}
        onOpenEditEventModal={vi.fn()}
      />
    );

    expect(result.match(/aria-label="Edit calendar event"/g)).toHaveLength(4);
  });
});
