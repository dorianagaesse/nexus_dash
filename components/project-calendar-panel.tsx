"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock3,
  ExternalLink,
  Pencil,
  PlusSquare,
  RefreshCcw,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ProjectCalendarPanelProps {
  projectId: string;
  calendarId: string | null;
}

interface CalendarEventItem {
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

interface CalendarEventsResponse {
  connected: boolean;
  calendarId?: string;
  range?: string;
  timeMin?: string;
  timeMax?: string;
  syncedAt?: string;
  events?: CalendarEventItem[];
  error?: string;
}

const CALENDAR_RANGE = "current-week";
const DAY_START_HOUR = 7;
const DAY_END_HOUR = 19;
const HOUR_CELL_HEIGHT_PX = 56;
const COMPACT_EVENT_HEIGHT_PX = 42;
const TOTAL_DAY_MINUTES = (DAY_END_HOUR - DAY_START_HOUR) * 60;
const TOTAL_GRID_HEIGHT_PX = (DAY_END_HOUR - DAY_START_HOUR) * HOUR_CELL_HEIGHT_PX;

interface DayEventBucket {
  allDay: CalendarEventItem[];
  timed: CalendarEventItem[];
}

type EventModalMode = "create" | "edit";

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getEventDateKey(event: CalendarEventItem): string | null {
  if (event.isAllDay) {
    return /^\d{4}-\d{2}-\d{2}$/.test(event.start) ? event.start : null;
  }

  const parsedDate = new Date(event.start);
  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return toDateKey(parsedDate);
}

function formatDayHeader(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatEventTimeLabel(event: CalendarEventItem): string {
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

function formatEventStartTimeLabel(event: CalendarEventItem): string {
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

function formatHourLabel(hour: number): string {
  const period = hour >= 12 ? "PM" : "AM";
  const normalizedHour = ((hour + 11) % 12) + 1;
  return `${normalizedHour}:00 ${period}`;
}

function getMinuteOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function buildTimedEventLayout(event: CalendarEventItem): {
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

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toDateTimeLocalInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function buildDefaultTimedWindow() {
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

function parseEventForForm(event: CalendarEventItem): {
  summary: string;
  isAllDay: boolean;
  startDate: string;
  endDate: string;
  startDateTime: string;
  endDateTime: string;
  location: string;
  description: string;
} {
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

function parseDateInputValue(value: string): Date | null {
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

function parseDateTimeInputValue(value: string): Date | null {
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

function toMonthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function isSameDate(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function buildCalendarGrid(monthDate: Date): Date[] {
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

function formatPickerFieldValue(value: string, includeTime: boolean): string {
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

interface CalendarDateTimeFieldProps {
  id: string;
  value: string;
  onChange: (nextValue: string) => void;
  includeTime: boolean;
  disabled: boolean;
}

function CalendarDateTimeField({
  id,
  value,
  onChange,
  includeTime,
  disabled,
}: CalendarDateTimeFieldProps) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const parsedValue = useMemo(
    () => (includeTime ? parseDateTimeInputValue(value) : parseDateInputValue(value)),
    [includeTime, value]
  );

  const fallbackDate = useMemo(() => new Date(), []);
  const selectedDate = useMemo(
    () => parsedValue ?? fallbackDate,
    [fallbackDate, parsedValue]
  );
  const [visibleMonth, setVisibleMonth] = useState<Date>(() => toMonthStart(selectedDate));
  const calendarDays = useMemo(() => buildCalendarGrid(visibleMonth), [visibleMonth]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setVisibleMonth(toMonthStart(selectedDate));
  }, [isOpen, selectedDate]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!wrapperRef.current) {
        return;
      }

      if (!wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const selectedHour = parsedValue?.getHours() ?? new Date().getHours();
  const selectedMinute = parsedValue?.getMinutes() ?? 0;

  const applyDate = (date: Date) => {
    if (!includeTime) {
      onChange(toDateInputValue(date));
      setIsOpen(false);
      return;
    }

    const nextDate = new Date(date);
    nextDate.setHours(selectedHour, selectedMinute, 0, 0);
    onChange(toDateTimeLocalInputValue(nextDate));
  };

  const applyTime = (hours: number, minutes: number) => {
    const baseDate = parsedValue ?? new Date();
    const nextDate = new Date(baseDate);
    nextDate.setHours(hours, minutes, 0, 0);
    onChange(toDateTimeLocalInputValue(nextDate));
  };

  const updateHour = (nextHourRaw: string) => {
    const nextHour = Number.parseInt(nextHourRaw, 10);
    if (Number.isNaN(nextHour)) {
      return;
    }
    applyTime(nextHour, selectedMinute);
  };

  const updateMinute = (nextMinuteRaw: string) => {
    const nextMinute = Number.parseInt(nextMinuteRaw, 10);
    if (Number.isNaN(nextMinute)) {
      return;
    }
    applyTime(selectedHour, nextMinute);
  };

  const monthLabel = visibleMonth.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  return (
    <div ref={wrapperRef} className="relative">
      <button
        id={id}
        type="button"
        className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-left text-sm transition hover:bg-muted/40"
        disabled={disabled}
        onClick={() => setIsOpen((previous) => !previous)}
      >
        <span className="truncate">{formatPickerFieldValue(value, includeTime)}</span>
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
      </button>

      {isOpen ? (
        <div className="absolute left-0 z-[80] mt-1 w-[320px] rounded-md border border-border/70 bg-popover p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium capitalize text-popover-foreground">{monthLabel}</p>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() =>
                  setVisibleMonth(
                    (previous) => new Date(previous.getFullYear(), previous.getMonth() - 1, 1)
                  )
                }
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() =>
                  setVisibleMonth(
                    (previous) => new Date(previous.getFullYear(), previous.getMonth() + 1, 1)
                  )
                }
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="mb-1 grid grid-cols-7 gap-1">
            {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((weekday) => (
              <span
                key={weekday}
                className="text-center text-[11px] font-medium text-muted-foreground"
              >
                {weekday}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((date) => {
              const isCurrentMonth = date.getMonth() === visibleMonth.getMonth();
              const isSelected = isSameDate(date, selectedDate);
              return (
                <button
                  key={`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`}
                  type="button"
                  className={cn(
                    "h-8 rounded text-sm transition",
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-muted",
                    isCurrentMonth ? "" : "text-muted-foreground/70"
                  )}
                  onClick={() => applyDate(date)}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>

          {includeTime ? (
            <div className="mt-3 flex items-center gap-2 rounded-md border border-border/60 bg-background px-2 py-1.5">
              <Clock3 className="h-4 w-4 text-muted-foreground" />
              <select
                className="h-8 flex-1 rounded border border-input bg-background px-2 text-sm"
                value={`${selectedHour}`.padStart(2, "0")}
                onChange={(event) => updateHour(event.target.value)}
              >
                {Array.from({ length: 24 }, (_, hour) => {
                  const hourValue = `${hour}`.padStart(2, "0");
                  return (
                    <option key={hourValue} value={hourValue}>
                      {hourValue}
                    </option>
                  );
                })}
              </select>
              <span className="text-sm text-muted-foreground">:</span>
              <select
                className="h-8 flex-1 rounded border border-input bg-background px-2 text-sm"
                value={`${selectedMinute}`.padStart(2, "0")}
                onChange={(event) => updateMinute(event.target.value)}
              >
                {["00", "15", "30", "45"].map((minuteValue) => (
                  <option key={minuteValue} value={minuteValue}>
                    {minuteValue}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-8 px-2"
                onClick={() => setIsOpen(false)}
              >
                Done
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ProjectCalendarPanel({ projectId, calendarId }: ProjectCalendarPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [events, setEvents] = useState<CalendarEventItem[]>([]);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [eventModalMode, setEventModalMode] = useState<EventModalMode>("create");
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [isSavingEvent, setIsSavingEvent] = useState(false);
  const [isDeletingEvent, setIsDeletingEvent] = useState(false);
  const [eventFormError, setEventFormError] = useState<string | null>(null);
  const [eventSummary, setEventSummary] = useState("");
  const [eventAllDay, setEventAllDay] = useState(false);
  const [eventStartDate, setEventStartDate] = useState("");
  const [eventEndDate, setEventEndDate] = useState("");
  const [eventStartDateTime, setEventStartDateTime] = useState("");
  const [eventEndDateTime, setEventEndDateTime] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [eventDescription, setEventDescription] = useState("");
  const [isBrowserReady, setIsBrowserReady] = useState(false);
  const isEventMutationPending = isSavingEvent || isDeletingEvent;

  const connectUrl = useMemo(
    () => `/api/auth/google?returnTo=${encodeURIComponent(`/projects/${projectId}`)}`,
    [projectId]
  );

  const calendarUrl = useMemo(() => {
    const resolvedCalendarId = calendarId?.trim();
    if (resolvedCalendarId) {
      const url = new URL("https://calendar.google.com/calendar/u/0/r");
      url.searchParams.set("cid", resolvedCalendarId);
      return url.toString();
    }

    return "https://calendar.google.com/calendar/u/0/r";
  }, [calendarId]);

  const resetEventForm = () => {
    const defaults = buildDefaultTimedWindow();
    const today = toDateInputValue(new Date());
    setEventSummary("");
    setEventAllDay(false);
    setEventStartDate(today);
    setEventEndDate(today);
    setEventStartDateTime(defaults.start);
    setEventEndDateTime(defaults.end);
    setEventLocation("");
    setEventDescription("");
    setEditingEventId(null);
    setEventFormError(null);
  };

  const openCreateEventModal = () => {
    setEventModalMode("create");
    resetEventForm();
    setIsEventModalOpen(true);
  };

  const openEditEventModal = (event: CalendarEventItem) => {
    const parsed = parseEventForForm(event);
    setEventModalMode("edit");
    setEditingEventId(event.id);
    setEventSummary(parsed.summary);
    setEventAllDay(parsed.isAllDay);
    setEventStartDate(parsed.startDate);
    setEventEndDate(parsed.endDate);
    setEventStartDateTime(parsed.startDateTime);
    setEventEndDateTime(parsed.endDateTime);
    setEventLocation(parsed.location);
    setEventDescription(parsed.description);
    setEventFormError(null);
    setIsEventModalOpen(true);
  };

  const closeEventModal = () => {
    if (isEventMutationPending) {
      return;
    }

    setIsEventModalOpen(false);
    setEventFormError(null);
  };

  const openGoogleEvent = (event: CalendarEventItem) => {
    if (!event.htmlLink) {
      return;
    }

    window.open(event.htmlLink, "_blank", "noopener,noreferrer");
  };

  const mapEventMutationError = (errorCode: string): string => {
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
  };

  useEffect(() => {
    setIsBrowserReady(true);
  }, []);

  useEffect(() => {
    try {
      const storageKey = `nexusdash:project:${projectId}:calendar-expanded`;
      const storedValue = window.localStorage.getItem(storageKey);

      if (storedValue === "1" || storedValue === "0") {
        setIsExpanded(storedValue === "1");
      }
    } catch (storageError) {
      console.error("[ProjectCalendarPanel.loadExpandedState]", storageError);
    }
  }, [projectId]);

  useEffect(() => {
    try {
      const storageKey = `nexusdash:project:${projectId}:calendar-expanded`;
      window.localStorage.setItem(storageKey, isExpanded ? "1" : "0");
    } catch (storageError) {
      console.error("[ProjectCalendarPanel.persistExpandedState]", storageError);
    }
  }, [isExpanded, projectId]);

  const loadEvents = async (signal?: AbortSignal) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/calendar/events?range=${CALENDAR_RANGE}`, {
        method: "GET",
        cache: "no-store",
        signal,
      });

      const payload = (await response.json().catch(() => null)) as
        | CalendarEventsResponse
        | null;

      if (response.status === 401) {
        setIsConnected(false);
        setEvents([]);
        setSyncedAt(null);
        return;
      }

      if (!response.ok || !payload) {
        throw new Error(payload?.error ?? "Could not load calendar events.");
      }

      setIsConnected(payload.connected);
      setEvents(payload.events ?? []);
      setSyncedAt(payload.syncedAt ?? null);
      setRangeStart(payload.timeMin ?? null);
    } catch (fetchError) {
      if (fetchError instanceof Error && fetchError.name === "AbortError") {
        return;
      }

      console.error("[ProjectCalendarPanel.loadEvents]", fetchError);
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : "Could not load calendar events."
      );
      setRangeStart(null);
    } finally {
      setIsLoading(false);
    }
  };

  const submitEventForm = async () => {
    const trimmedSummary = eventSummary.trim();
    if (!trimmedSummary) {
      setEventFormError("Event title is required.");
      return;
    }

    if (eventModalMode === "edit" && !editingEventId) {
      setEventFormError("No calendar event selected for editing.");
      return;
    }

    const startValue = eventAllDay ? eventStartDate : eventStartDateTime;
    const endValue = eventAllDay ? eventEndDate : eventEndDateTime;
    if (!startValue || !endValue) {
      setEventFormError("Please provide start and end values.");
      return;
    }

    setIsSavingEvent(true);
    setEventFormError(null);

    try {
      const endpoint =
        eventModalMode === "create"
          ? "/api/calendar/events"
          : `/api/calendar/events/${editingEventId}`;
      const method = eventModalMode === "create" ? "POST" : "PATCH";

      const response = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary: trimmedSummary,
          isAllDay: eventAllDay,
          start: startValue,
          end: endValue,
          location: eventLocation.trim(),
          description: eventDescription.trim(),
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(mapEventMutationError(payload?.error ?? "calendar-internal-error"));
      }

      setIsEventModalOpen(false);
      await loadEvents();
    } catch (submitError) {
      setEventFormError(
        submitError instanceof Error
          ? submitError.message
          : "Could not save calendar event."
      );
    } finally {
      setIsSavingEvent(false);
    }
  };

  const handleDeleteEvent = async () => {
    if (eventModalMode !== "edit" || !editingEventId) {
      setEventFormError("No calendar event selected for deletion.");
      return;
    }

    const confirmed = window.confirm("Delete this event from Google Calendar?");
    if (!confirmed) {
      return;
    }

    setIsDeletingEvent(true);
    setEventFormError(null);

    try {
      const response = await fetch(`/api/calendar/events/${editingEventId}`, {
        method: "DELETE",
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(mapEventMutationError(payload?.error ?? "calendar-internal-error"));
      }

      setIsEventModalOpen(false);
      await loadEvents();
    } catch (deleteError) {
      setEventFormError(
        deleteError instanceof Error
          ? deleteError.message
          : "Could not delete calendar event."
      );
    } finally {
      setIsDeletingEvent(false);
    }
  };

  useEffect(() => {
    if (!isExpanded) {
      return;
    }

    const controller = new AbortController();
    void loadEvents(controller.signal);

    return () => {
      controller.abort();
    };
  }, [isExpanded]);

  const weekDays = useMemo(() => {
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
  }, [rangeStart]);

  const eventsByDay = useMemo(() => {
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
  }, [events, weekDays]);

  return (
    <>
      <Card className="border-0 bg-transparent shadow-none">
        <CardHeader className={cn("space-y-2 px-0 pt-0", isExpanded ? "pb-3" : "pb-2")}>
          <button
            type="button"
            onClick={() => setIsExpanded((previous) => !previous)}
            aria-expanded={isExpanded}
            className="flex min-w-0 items-center gap-2 rounded-md px-1 py-1 text-left transition hover:bg-muted/40"
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
            <CardTitle className="text-lg font-semibold tracking-tight">
              <span className="inline-flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                Calendar
              </span>
            </CardTitle>
          </button>
          {isExpanded ? (
            <p className="text-sm text-muted-foreground">
              Current week events (Monday to Sunday).
            </p>
          ) : null}
        </CardHeader>

        {isExpanded ? (
          <CardContent className="space-y-3 px-0">
            {isLoading ? (
              <div className="rounded-md border border-border/60 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
                Loading calendar events...
              </div>
            ) : null}

            {!isLoading && isConnected === false ? (
              <div className="space-y-3 rounded-md border border-border/60 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
                <p>Google Calendar is not connected yet.</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" size="sm" asChild>
                    <a href={connectUrl}>Connect Google Calendar</a>
                  </Button>
                  <Button type="button" variant="outline" size="sm" asChild>
                    <a href={calendarUrl} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-4 w-4" />
                      Open Google Calendar
                    </a>
                  </Button>
                </div>
              </div>
            ) : null}

            {!isLoading && isConnected === true ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                  <p className="text-xs text-muted-foreground">
                    {syncedAt
                      ? `Synced at ${new Date(syncedAt).toLocaleString()}`
                      : "Calendar connected"}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={openCreateEventModal}
                      disabled={isLoading}
                    >
                      <PlusSquare className="h-4 w-4" />
                      New event
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void loadEvents()}
                      disabled={isLoading}
                    >
                      <RefreshCcw className="h-4 w-4" />
                      Refresh
                    </Button>
                  </div>
                </div>

                {weekDays.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border/60 px-4 py-6 text-sm text-muted-foreground">
                    Could not resolve the current week window.
                  </div>
                ) : (
                  <div className="space-y-3 overflow-x-auto">
                    <div className="grid min-w-[1180px] grid-cols-[80px_repeat(7,minmax(0,1fr))] gap-2">
                      <div className="pt-1 text-[11px] font-medium text-muted-foreground">
                        All day
                      </div>
                      {weekDays.map((day) => {
                        const dayKey = toDateKey(day);
                        const dayBucket = eventsByDay.get(dayKey);
                        const allDayEvents = dayBucket?.allDay ?? [];

                        return (
                          <section
                            key={`all-day-${dayKey}`}
                            className="rounded-md border border-border/60 bg-background px-2 py-2"
                          >
                            <header className="mb-2 border-b border-border/60 pb-1.5">
                              <p className="text-xs font-medium text-foreground">
                                {formatDayHeader(day)}
                              </p>
                            </header>
                            <div className="space-y-1">
                              {allDayEvents.length === 0 ? (
                                <p className="text-[11px] text-muted-foreground">No all-day events</p>
                              ) : (
                                allDayEvents.map((event) => {
                                  const canOpen = Boolean(event.htmlLink);
                                  const eventTitle = `${event.summary} - ${formatEventTimeLabel(event)}`;

                                  return (
                                    <article
                                      key={event.id}
                                      className={cn(
                                        "flex items-center gap-1 rounded border border-border/60 bg-muted/20 px-2 py-1",
                                        canOpen ? "cursor-pointer transition hover:bg-muted/30" : ""
                                      )}
                                      title={eventTitle}
                                      onClick={() => openGoogleEvent(event)}
                                      onKeyDown={(keyboardEvent) => {
                                        if (
                                          canOpen &&
                                          (keyboardEvent.key === "Enter" || keyboardEvent.key === " ")
                                        ) {
                                          keyboardEvent.preventDefault();
                                          openGoogleEvent(event);
                                        }
                                      }}
                                      role={canOpen ? "button" : undefined}
                                      tabIndex={canOpen ? 0 : undefined}
                                    >
                                      <p className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground">
                                        {event.summary}
                                      </p>
                                      <button
                                        type="button"
                                        onClick={(mouseEvent) => {
                                          mouseEvent.stopPropagation();
                                          openEditEventModal(event);
                                        }}
                                        className="rounded p-0.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                                        aria-label="Edit calendar event"
                                      >
                                        <Pencil className="h-3 w-3" />
                                      </button>
                                    </article>
                                  );
                                })
                              )}
                            </div>
                          </section>
                        );
                      })}
                    </div>

                    <div className="grid min-w-[1180px] grid-cols-[80px_repeat(7,minmax(0,1fr))] gap-2">
                      <div
                        className="relative rounded-md border border-border/60 bg-muted/20"
                        style={{ height: `${TOTAL_GRID_HEIGHT_PX}px` }}
                      >
                        {Array.from(
                          { length: DAY_END_HOUR - DAY_START_HOUR + 1 },
                          (_, index) => {
                            const hour = DAY_START_HOUR + index;
                            const top = index * HOUR_CELL_HEIGHT_PX;

                            return (
                              <div
                                key={`hour-label-${hour}`}
                                className="absolute left-0 right-0"
                                style={{ top: `${top}px` }}
                              >
                                <span className="absolute -top-2 left-2 rounded bg-background px-1 text-[10px] text-muted-foreground">
                                  {formatHourLabel(hour)}
                                </span>
                              </div>
                            );
                          }
                        )}
                      </div>

                      {weekDays.map((day) => {
                        const dayKey = toDateKey(day);
                        const dayBucket = eventsByDay.get(dayKey);
                        const timedEvents = dayBucket?.timed ?? [];

                        return (
                          <section
                            key={`timed-${dayKey}`}
                            className="relative overflow-hidden rounded-md border border-border/60 bg-background"
                            style={{ height: `${TOTAL_GRID_HEIGHT_PX}px` }}
                          >
                            {Array.from(
                              { length: DAY_END_HOUR - DAY_START_HOUR + 1 },
                              (_, index) => {
                                const top = index * HOUR_CELL_HEIGHT_PX;
                                return (
                                  <div
                                    key={`line-${dayKey}-${index}`}
                                    className="absolute left-0 right-0 border-t border-border/40"
                                    style={{ top: `${top}px` }}
                                  />
                                );
                              }
                            )}

                            {timedEvents.map((event) => {
                              const layout = buildTimedEventLayout(event);
                              if (!layout) {
                                return null;
                              }

                              const isCompactEvent = layout.heightPx < COMPACT_EVENT_HEIGHT_PX;
                              const canOpen = Boolean(event.htmlLink);
                              const eventTitle = `${event.summary} - ${formatEventTimeLabel(event)}`;

                              const baseClassName =
                                "absolute left-1 right-1 overflow-hidden rounded-md border border-sky-500/40 bg-sky-500/10 px-1.5 py-1";
                              const style = {
                                top: `${layout.topPx}px`,
                                height: `${layout.heightPx}px`,
                              };

                              const content = isCompactEvent ? (
                                <div className="flex min-w-0 items-center gap-1">
                                  <p className="min-w-0 flex-1 truncate text-[10px] font-medium text-foreground">
                                    {event.summary}
                                  </p>
                                  <span className="shrink-0 text-[10px] text-muted-foreground">
                                    {formatEventStartTimeLabel(event)}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={(mouseEvent) => {
                                      mouseEvent.stopPropagation();
                                      openEditEventModal(event);
                                    }}
                                    className="shrink-0 rounded p-0.5 text-muted-foreground transition hover:bg-sky-500/20 hover:text-foreground"
                                    aria-label="Edit calendar event"
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex min-w-0 items-start gap-1">
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-[11px] font-medium text-foreground">
                                      {event.summary}
                                    </p>
                                    <p className="truncate text-[10px] text-muted-foreground">
                                      {formatEventTimeLabel(event)}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={(mouseEvent) => {
                                      mouseEvent.stopPropagation();
                                      openEditEventModal(event);
                                    }}
                                    className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground transition hover:bg-sky-500/20 hover:text-foreground"
                                    aria-label="Edit calendar event"
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </button>
                                </div>
                              );

                              return (
                                <article
                                  key={event.id}
                                  title={eventTitle}
                                  className={cn(
                                    baseClassName,
                                    canOpen ? "cursor-pointer transition hover:bg-sky-500/20" : ""
                                  )}
                                  style={style}
                                  onClick={() => openGoogleEvent(event)}
                                  onKeyDown={(keyboardEvent) => {
                                    if (
                                      canOpen &&
                                      (keyboardEvent.key === "Enter" || keyboardEvent.key === " ")
                                    ) {
                                      keyboardEvent.preventDefault();
                                      openGoogleEvent(event);
                                    }
                                  }}
                                  role={canOpen ? "button" : undefined}
                                  tabIndex={canOpen ? 0 : undefined}
                                >
                                  {content}
                                </article>
                              );
                            })}
                          </section>
                        );
                      })}
                    </div>

                    {events.length === 0 ? (
                      <div className="rounded-md border border-dashed border-border/60 px-4 py-4 text-sm text-muted-foreground">
                        No events in the current week.
                      </div>
                    ) : null}
                  </div>
                )}
              </>
            ) : null}

            {!isLoading && error ? (
              <div className="space-y-3 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive-foreground">
                <p>{error}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => void loadEvents()}
                  >
                    Retry
                  </Button>
                  <Button type="button" variant="outline" size="sm" asChild>
                    <a href={connectUrl}>Reconnect</a>
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        ) : null}
      </Card>

      {isBrowserReady && isEventModalOpen ? createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onMouseDown={(mouseEvent) => {
            if (mouseEvent.target === mouseEvent.currentTarget) {
              closeEventModal();
            }
          }}
        >
          <Card
            className="w-full max-w-lg"
            onMouseDown={(mouseEvent) => mouseEvent.stopPropagation()}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-lg">
                {eventModalMode === "create" ? "Create calendar event" : "Edit calendar event"}
              </CardTitle>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={closeEventModal}
                disabled={isEventMutationPending}
              >
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <form
                className="grid gap-4"
                onSubmit={(submitEvent) => {
                  submitEvent.preventDefault();
                  void submitEventForm();
                }}
              >
                <div className="grid gap-2">
                  <label htmlFor="calendar-event-summary" className="text-sm font-medium">
                    Title
                  </label>
                  <input
                    id="calendar-event-summary"
                    value={eventSummary}
                    onChange={(event) => setEventSummary(event.target.value)}
                    minLength={1}
                    maxLength={200}
                    required
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    placeholder="Weekly planning"
                    disabled={isEventMutationPending}
                  />
                </div>

                <label className="inline-flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={eventAllDay}
                    onChange={(event) => setEventAllDay(event.target.checked)}
                    className="h-4 w-4 rounded border-input"
                    disabled={isEventMutationPending}
                  />
                  All day event
                </label>

                {eventAllDay ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <label htmlFor="calendar-event-start-date" className="text-sm font-medium">
                        Start date
                      </label>
                      <CalendarDateTimeField
                        id="calendar-event-start-date"
                        value={eventStartDate}
                        onChange={setEventStartDate}
                        includeTime={false}
                        disabled={isEventMutationPending}
                      />
                    </div>
                    <div className="grid gap-2">
                      <label htmlFor="calendar-event-end-date" className="text-sm font-medium">
                        End date
                      </label>
                      <CalendarDateTimeField
                        id="calendar-event-end-date"
                        value={eventEndDate}
                        onChange={setEventEndDate}
                        includeTime={false}
                        disabled={isEventMutationPending}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <label htmlFor="calendar-event-start-date-time" className="text-sm font-medium">
                        Start
                      </label>
                      <CalendarDateTimeField
                        id="calendar-event-start-date-time"
                        value={eventStartDateTime}
                        onChange={setEventStartDateTime}
                        includeTime
                        disabled={isEventMutationPending}
                      />
                    </div>
                    <div className="grid gap-2">
                      <label htmlFor="calendar-event-end-date-time" className="text-sm font-medium">
                        End
                      </label>
                      <CalendarDateTimeField
                        id="calendar-event-end-date-time"
                        value={eventEndDateTime}
                        onChange={setEventEndDateTime}
                        includeTime
                        disabled={isEventMutationPending}
                      />
                    </div>
                  </div>
                )}

                <div className="grid gap-2">
                  <label htmlFor="calendar-event-location" className="text-sm font-medium">
                    Location (optional)
                  </label>
                  <input
                    id="calendar-event-location"
                    value={eventLocation}
                    onChange={(event) => setEventLocation(event.target.value)}
                    maxLength={200}
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    placeholder="Office / Video call / Address"
                    disabled={isEventMutationPending}
                  />
                </div>

                <div className="grid gap-2">
                  <label htmlFor="calendar-event-description" className="text-sm font-medium">
                    Description (optional)
                  </label>
                  <textarea
                    id="calendar-event-description"
                    value={eventDescription}
                    onChange={(event) => setEventDescription(event.target.value)}
                    maxLength={4000}
                    rows={4}
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                    placeholder="Event details..."
                    disabled={isEventMutationPending}
                  />
                </div>

                {eventFormError ? (
                  <div className="space-y-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive dark:text-red-200">
                    <p>{eventFormError}</p>
                    {eventFormError.includes("Reconnect Google Calendar") ? (
                      <Button type="button" variant="outline" size="sm" asChild>
                        <a href={connectUrl}>Reconnect</a>
                      </Button>
                    ) : null}
                  </div>
                ) : null}

                <div className="flex items-center gap-2">
                  {eventModalMode === "edit" ? (
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => void handleDeleteEvent()}
                      disabled={isEventMutationPending}
                    >
                      <Trash2 className="h-4 w-4" />
                      {isDeletingEvent ? "Deleting..." : "Delete event"}
                    </Button>
                  ) : null}
                  <Button type="submit" disabled={isEventMutationPending}>
                    {isSavingEvent
                      ? eventModalMode === "create"
                        ? "Creating..."
                        : "Saving..."
                      : eventModalMode === "create"
                        ? "Create event"
                        : "Save changes"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={closeEventModal}
                    disabled={isEventMutationPending}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>,
        document.body
      ) : null}
    </>
  );
}
