"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronDown, ChevronUp, ExternalLink, RefreshCcw } from "lucide-react";

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

export function ProjectCalendarPanel({ projectId, calendarId }: ProjectCalendarPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [events, setEvents] = useState<CalendarEventItem[]>([]);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    const grouped = new Map<string, CalendarEventItem[]>();

    weekDays.forEach((day) => {
      grouped.set(toDateKey(day), []);
    });

    events.forEach((event) => {
      const key = getEventDateKey(event);
      if (!key || !grouped.has(key)) {
        return;
      }
      grouped.get(key)?.push(event);
    });

    return grouped;
  }, [events, weekDays]);

  return (
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
                    variant="ghost"
                    size="sm"
                    onClick={() => void loadEvents()}
                    disabled={isLoading}
                  >
                    <RefreshCcw className="h-4 w-4" />
                    Refresh
                  </Button>
                  <Button type="button" variant="outline" size="sm" asChild>
                    <a href={calendarUrl} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-4 w-4" />
                      Open
                    </a>
                  </Button>
                </div>
              </div>

              {weekDays.length === 0 ? (
                <div className="rounded-md border border-dashed border-border/60 px-4 py-6 text-sm text-muted-foreground">
                  Could not resolve the current week window.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <div className="grid min-w-[980px] grid-cols-7 gap-2">
                    {weekDays.map((day) => {
                      const dayKey = toDateKey(day);
                      const dayEvents = eventsByDay.get(dayKey) ?? [];

                      return (
                        <section
                          key={dayKey}
                          className="rounded-md border border-border/60 bg-background"
                        >
                          <header className="border-b border-border/60 px-2 py-1.5">
                            <p className="text-xs font-medium text-foreground">
                              {formatDayHeader(day)}
                            </p>
                          </header>
                          <div className="space-y-2 px-2 py-2">
                            {dayEvents.length === 0 ? (
                              <p className="text-xs text-muted-foreground">No events</p>
                            ) : (
                              dayEvents.map((event) => (
                                <article
                                  key={event.id}
                                  className="rounded border border-border/60 bg-muted/10 px-2 py-1.5"
                                >
                                  <div className="flex items-start justify-between gap-1">
                                    <div className="min-w-0">
                                      <p className="truncate text-xs font-medium text-foreground">
                                        {event.summary}
                                      </p>
                                      <p className="text-[11px] text-muted-foreground">
                                        {formatEventTimeLabel(event)}
                                      </p>
                                      {event.location ? (
                                        <p className="truncate text-[11px] text-muted-foreground">
                                          {event.location}
                                        </p>
                                      ) : null}
                                    </div>

                                    {event.htmlLink ? (
                                      <a
                                        href={event.htmlLink}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-[11px] text-foreground underline underline-offset-2"
                                      >
                                        Open
                                      </a>
                                    ) : null}
                                  </div>
                                </article>
                              ))
                            )}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          ) : null}

          {!isLoading && error ? (
            <div className="space-y-3 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive-foreground">
              <p>{error}</p>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" variant="secondary" onClick={() => void loadEvents()}>
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
  );
}
