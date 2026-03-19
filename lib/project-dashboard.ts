import type { CalendarEventResponseItem } from "@/lib/services/calendar-service";

function parseEventStart(value: string): number | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [yearRaw, monthRaw, dayRaw] = value.split("-");
    const year = Number.parseInt(yearRaw ?? "", 10);
    const month = Number.parseInt(monthRaw ?? "", 10);
    const day = Number.parseInt(dayRaw ?? "", 10);

    if (
      !Number.isFinite(year) ||
      !Number.isFinite(month) ||
      !Number.isFinite(day)
    ) {
      return null;
    }

    return Date.UTC(year, month - 1, day);
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export function countUpcomingEventsThisWeek(
  events: CalendarEventResponseItem[],
  now: Date = new Date()
): number {
  const nowMs = now.getTime();

  return events.reduce((total, event) => {
    const startMs = parseEventStart(event.start);
    if (startMs === null || startMs < nowMs) {
      return total;
    }

    return total + 1;
  }, 0);
}

export function formatUpcomingEventsLabel(count: number | null): string {
  if (count === null) {
    return "This week unavailable";
  }

  if (count === 0) {
    return "No events to come";
  }

  return `${count} event${count === 1 ? "" : "s"} to come`;
}
