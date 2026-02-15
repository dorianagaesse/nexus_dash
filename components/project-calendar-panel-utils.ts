const DAY_START_HOUR = 7;
const DAY_END_HOUR = 19;
const HOUR_CELL_HEIGHT_PX = 56;
const COMPACT_EVENT_HEIGHT_PX = 42;
const TOTAL_DAY_MINUTES = (DAY_END_HOUR - DAY_START_HOUR) * 60;
const TOTAL_GRID_HEIGHT_PX = (DAY_END_HOUR - DAY_START_HOUR) * HOUR_CELL_HEIGHT_PX;

export const CALENDAR_RANGE = "current-week";
export const CALENDAR_DAY_START_HOUR = DAY_START_HOUR;
export const CALENDAR_DAY_END_HOUR = DAY_END_HOUR;
export const CALENDAR_HOUR_CELL_HEIGHT_PX = HOUR_CELL_HEIGHT_PX;
export const CALENDAR_COMPACT_EVENT_HEIGHT_PX = COMPACT_EVENT_HEIGHT_PX;
export const CALENDAR_TOTAL_GRID_HEIGHT_PX = TOTAL_GRID_HEIGHT_PX;

export interface CalendarEventItem {
  id: string;
  summary: string;
  start: string;
  end: string | null;
  isAllDay: boolean;
  location: string | null;
  description: string | null;
  htmlLink: string | null;
  status: string;
}

export interface CalendarEventsResponse {
  connected: boolean;
  calendarId?: string;
  range?: string;
  timeMin?: string;
  timeMax?: string;
  syncedAt?: string;
  events?: CalendarEventItem[];
  error?: string;
}

export interface DayEventBucket {
  allDay: CalendarEventItem[];
  timed: CalendarEventItem[];
}

export interface CalendarEventFormState {
  summary: string;
  isAllDay: boolean;
  startDate: string;
  endDate: string;
  startDateTime: string;
  endDateTime: string;
  location: string;
  description: string;
}

export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getEventDateKey(event: CalendarEventItem): string | null {
  if (event.isAllDay) {
    return /^\d{4}-\d{2}-\d{2}$/.test(event.start) ? event.start : null;
  }

  const parsedDate = new Date(event.start);
  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return toDateKey(parsedDate);
}

export function formatDayHeader(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function formatEventTimeLabel(event: CalendarEventItem): string {
  if (event.isAllDay) {
    return "All day";
  }

  const startDate = new Date(event.start);
  if (Number.isNaN(startDate.getTime())) {
    return "";
  }

  const startLabel = startDate.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (!event.end) {
    return startLabel;
  }

  const endDate = new Date(event.end);
  if (Number.isNaN(endDate.getTime())) {
    return startLabel;
  }

  const endLabel = endDate.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

  return `${startLabel} - ${endLabel}`;
}

export function formatEventStartTimeLabel(event: CalendarEventItem): string {
  if (event.isAllDay) {
    return "All day";
  }

  const startDate = new Date(event.start);
  if (Number.isNaN(startDate.getTime())) {
    return "";
  }

  return startDate.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatHourLabel(hour: number): string {
  const period = hour >= 12 ? "PM" : "AM";
  const normalizedHour = ((hour + 11) % 12) + 1;
  return `${normalizedHour}:00 ${period}`;
}

function getMinuteOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

export function buildTimedEventLayout(event: CalendarEventItem): {
  topPx: number;
  heightPx: number;
} | null {
  if (event.isAllDay) {
    return null;
  }

  const startDate = new Date(event.start);
  if (Number.isNaN(startDate.getTime())) {
    return null;
  }

  const endDate = event.end
    ? new Date(event.end)
    : new Date(startDate.getTime() + 30 * 60 * 1000);
  if (Number.isNaN(endDate.getTime())) {
    return null;
  }

  const windowStartMinute = DAY_START_HOUR * 60;
  const windowEndMinute = DAY_END_HOUR * 60;
  const startMinute = getMinuteOfDay(startDate);
  const endMinute = Math.max(getMinuteOfDay(endDate), startMinute + 15);

  const clippedStart = Math.max(startMinute, windowStartMinute);
  const clippedEnd = Math.min(endMinute, windowEndMinute);

  if (clippedEnd <= clippedStart) {
    return null;
  }

  const topPx =
    ((clippedStart - windowStartMinute) / TOTAL_DAY_MINUTES) * TOTAL_GRID_HEIGHT_PX;
  const heightPx = Math.max(
    24,
    ((clippedEnd - clippedStart) / TOTAL_DAY_MINUTES) * TOTAL_GRID_HEIGHT_PX
  );

  return { topPx, heightPx };
}

export function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function toDateTimeLocalInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

export function buildDefaultTimedWindow() {
  const now = new Date();
  now.setSeconds(0, 0);
  const minuteBucket = Math.ceil(now.getMinutes() / 30) * 30;
  now.setMinutes(minuteBucket === 60 ? 0 : minuteBucket);
  if (minuteBucket === 60) {
    now.setHours(now.getHours() + 1);
  }

  const start = now;
  const end = addMinutes(start, 30);
  return {
    start: toDateTimeLocalInputValue(start),
    end: toDateTimeLocalInputValue(end),
  };
}

export function parseEventForForm(event: CalendarEventItem): CalendarEventFormState {
  if (event.isAllDay) {
    const startDate = /^\d{4}-\d{2}-\d{2}$/.test(event.start)
      ? event.start
      : toDateInputValue(new Date(event.start));
    let endDate = startDate;

    if (event.end && /^\d{4}-\d{2}-\d{2}$/.test(event.end)) {
      const endExclusive = new Date(`${event.end}T00:00:00`);
      endExclusive.setDate(endExclusive.getDate() - 1);
      endDate = toDateInputValue(endExclusive);
    }

    const defaults = buildDefaultTimedWindow();
    return {
      summary: event.summary,
      isAllDay: true,
      startDate,
      endDate,
      startDateTime: defaults.start,
      endDateTime: defaults.end,
      location: event.location ?? "",
      description: event.description ?? "",
    };
  }

  const startDate = new Date(event.start);
  const endDate = event.end ? new Date(event.end) : addMinutes(startDate, 30);
  const startFallback = buildDefaultTimedWindow();

  return {
    summary: event.summary,
    isAllDay: false,
    startDate: toDateInputValue(startDate),
    endDate: toDateInputValue(endDate),
    startDateTime: Number.isNaN(startDate.getTime())
      ? startFallback.start
      : toDateTimeLocalInputValue(startDate),
    endDateTime: Number.isNaN(endDate.getTime())
      ? startFallback.end
      : toDateTimeLocalInputValue(endDate),
    location: event.location ?? "",
    description: event.description ?? "",
  };
}

export function parseDateInputValue(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  const parsed = new Date(year, month - 1, day);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function parseDateTimeInputValue(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  const hours = Number.parseInt(match[4], 10);
  const minutes = Number.parseInt(match[5], 10);
  const parsed = new Date(year, month - 1, day, hours, minutes, 0, 0);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function toMonthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function isSameDate(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export function buildCalendarGrid(monthDate: Date): Date[] {
  const firstOfMonth = toMonthStart(monthDate);
  const weekdayIndex = (firstOfMonth.getDay() + 6) % 7;
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(firstOfMonth.getDate() - weekdayIndex);

  return Array.from({ length: 42 }, (_, index) => {
    const nextDay = new Date(gridStart);
    nextDay.setDate(gridStart.getDate() + index);
    return nextDay;
  });
}

export function formatPickerFieldValue(value: string, includeTime: boolean): string {
  const parsed = includeTime ? parseDateTimeInputValue(value) : parseDateInputValue(value);
  if (!parsed) {
    return includeTime ? "Select date and time" : "Select date";
  }

  if (!includeTime) {
    return parsed.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  return parsed.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function buildWeekDays(rangeStart: string | null): Date[] {
  if (!rangeStart) {
    return [];
  }

  const parsedStart = new Date(rangeStart);
  if (Number.isNaN(parsedStart.getTime())) {
    return [];
  }

  const days: Date[] = [];
  for (let offset = 0; offset < 7; offset += 1) {
    const day = new Date(parsedStart);
    day.setDate(parsedStart.getDate() + offset);
    days.push(day);
  }

  return days;
}

export function groupEventsByDay(
  events: CalendarEventItem[],
  weekDays: Date[]
): Map<string, DayEventBucket> {
  const grouped = new Map<string, DayEventBucket>();

  weekDays.forEach((day) => {
    grouped.set(toDateKey(day), {
      allDay: [],
      timed: [],
    });
  });

  events.forEach((event) => {
    const key = getEventDateKey(event);
    if (!key || !grouped.has(key)) {
      return;
    }

    const bucket = grouped.get(key);
    if (!bucket) {
      return;
    }

    if (event.isAllDay) {
      bucket.allDay.push(event);
    } else {
      bucket.timed.push(event);
    }
  });

  grouped.forEach((bucket) => {
    bucket.timed.sort((left, right) => {
      const leftTime = new Date(left.start).getTime();
      const rightTime = new Date(right.start).getTime();
      return leftTime - rightTime;
    });
  });

  return grouped;
}

export function mapEventMutationError(errorCode: string): string {
  switch (errorCode) {
    case "insufficient-scope":
      return "Google permissions are insufficient. Reconnect Google Calendar and grant event access.";
    case "reauthorization-required":
      return "Google authorization expired. Please reconnect Google Calendar.";
    case "invalid-summary":
      return "Event title is required and must be 200 characters or fewer.";
    case "invalid-dates":
      return "Please provide valid start and end dates.";
    case "invalid-date-order":
      return "End date/time must be after start date/time.";
    case "event-not-found":
      return "Event no longer exists in Google Calendar.";
    case "calendar-create-failed":
      return "Could not create event in Google Calendar.";
    case "calendar-update-failed":
      return "Could not update event in Google Calendar.";
    case "calendar-delete-failed":
      return "Could not delete event in Google Calendar.";
    default:
      return "Could not save calendar event.";
  }
}
