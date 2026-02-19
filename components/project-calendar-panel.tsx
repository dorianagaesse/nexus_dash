"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Pencil,
  PlusSquare,
  RefreshCcw,
  Trash2,
  X,
} from "lucide-react";

import { CalendarDateTimeField } from "@/components/calendar-date-time-field";
import {
  buildDefaultTimedWindow,
  buildTimedEventLayout,
  buildWeekDays,
  CALENDAR_COMPACT_EVENT_HEIGHT_PX,
  CALENDAR_DAY_END_HOUR,
  CALENDAR_DAY_START_HOUR,
  CALENDAR_HOUR_CELL_HEIGHT_PX,
  CALENDAR_RANGE,
  CALENDAR_TOTAL_GRID_HEIGHT_PX,
  formatDayHeader,
  formatEventStartTimeLabel,
  formatEventTimeLabel,
  formatHourLabel,
  groupEventsByDay,
  mapEventMutationError,
  parseEventForForm,
  toDateInputValue,
  toDateKey,
  type CalendarEventItem,
  type CalendarEventsResponse,
} from "@/components/project-calendar-panel-utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useProjectSectionExpanded } from "@/lib/hooks/use-project-section-expanded";
import { cn } from "@/lib/utils";

interface ProjectCalendarPanelProps {
  projectId: string;
  calendarId: string | null;
}

type EventModalMode = "create" | "edit";

export function ProjectCalendarPanel({ projectId, calendarId }: ProjectCalendarPanelProps) {
  const { isExpanded, setIsExpanded } = useProjectSectionExpanded({
    projectId,
    sectionKey: "calendar",
    defaultExpanded: false,
    logLabel: "ProjectCalendarPanel",
  });
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

  useEffect(() => {
    setIsBrowserReady(true);
  }, []);

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

  const weekDays = useMemo(() => buildWeekDays(rangeStart), [rangeStart]);
  const eventsByDay = useMemo(() => groupEventsByDay(events, weekDays), [events, weekDays]);

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
                        style={{ height: `${CALENDAR_TOTAL_GRID_HEIGHT_PX}px` }}
                      >
                        {Array.from(
                          {
                            length:
                              CALENDAR_DAY_END_HOUR - CALENDAR_DAY_START_HOUR + 1,
                          },
                          (_, index) => {
                            const hour = CALENDAR_DAY_START_HOUR + index;
                            const top = index * CALENDAR_HOUR_CELL_HEIGHT_PX;

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
                            style={{ height: `${CALENDAR_TOTAL_GRID_HEIGHT_PX}px` }}
                          >
                            {Array.from(
                              {
                                length:
                                  CALENDAR_DAY_END_HOUR - CALENDAR_DAY_START_HOUR + 1,
                              },
                              (_, index) => {
                                const top = index * CALENDAR_HOUR_CELL_HEIGHT_PX;
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

                              const isCompactEvent =
                                layout.heightPx < CALENDAR_COMPACT_EVENT_HEIGHT_PX;
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
              <div className="space-y-3 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
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
