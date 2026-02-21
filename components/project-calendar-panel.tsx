"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  PlusSquare,
  RefreshCcw,
} from "lucide-react";

import { CalendarEventModal } from "@/components/calendar-panel/calendar-event-modal";
import { CalendarWeekGrid } from "@/components/calendar-panel/calendar-week-grid";
import {
  buildDefaultTimedWindow,
  buildWeekDays,
  CALENDAR_RANGE,
  groupEventsByDay,
  mapEventMutationError,
  parseEventForForm,
  toDateInputValue,
  type CalendarEventItem,
  type CalendarEventsResponse,
} from "@/components/project-calendar-panel-utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useProjectSectionExpanded } from "@/lib/hooks/use-project-section-expanded";
import { cn } from "@/lib/utils";

interface ProjectCalendarPanelProps {
  projectId: string;
}

type EventModalMode = "create" | "edit";

export function ProjectCalendarPanel({ projectId }: ProjectCalendarPanelProps) {
  const { isExpanded, setIsExpanded } = useProjectSectionExpanded({
    projectId,
    sectionKey: "calendar",
    defaultExpanded: false,
    logLabel: "ProjectCalendarPanel",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [events, setEvents] = useState<CalendarEventItem[]>([]);
  const [resolvedCalendarId, setResolvedCalendarId] = useState<string | null>(null);
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
    const targetCalendarId = resolvedCalendarId?.trim();
    if (targetCalendarId) {
      const url = new URL("https://calendar.google.com/calendar/u/0/r");
      url.searchParams.set("cid", targetCalendarId);
      return url.toString();
    }

    return "https://calendar.google.com/calendar/u/0/r";
  }, [resolvedCalendarId]);

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

  const loadEvents = useCallback(
    async (signal?: AbortSignal) => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/calendar/events?range=${CALENDAR_RANGE}&projectId=${encodeURIComponent(
            projectId
          )}`,
          {
            method: "GET",
            cache: "no-store",
            signal,
          }
        );

        const payload = (await response.json().catch(() => null)) as
          | CalendarEventsResponse
          | null;

        if (response.status === 401) {
          setIsConnected(false);
          setEvents([]);
          setResolvedCalendarId(null);
          setSyncedAt(null);
          return;
        }

        if (!response.ok || !payload) {
          throw new Error(payload?.error ?? "Could not load calendar events.");
        }

        setIsConnected(payload.connected);
        setEvents(payload.events ?? []);
        setResolvedCalendarId(payload.calendarId ?? null);
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
    },
    [projectId]
  );

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
          ? `/api/calendar/events?projectId=${encodeURIComponent(projectId)}`
          : `/api/calendar/events/${editingEventId}?projectId=${encodeURIComponent(
              projectId
            )}`;
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
      const response = await fetch(
        `/api/calendar/events/${editingEventId}?projectId=${encodeURIComponent(
          projectId
        )}`,
        {
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
  }, [isExpanded, loadEvents]);

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

                <CalendarWeekGrid
                  weekDays={weekDays}
                  eventsByDay={eventsByDay}
                  eventsCount={events.length}
                  onOpenGoogleEvent={openGoogleEvent}
                  onOpenEditEventModal={openEditEventModal}
                />
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

      <CalendarEventModal
        isOpen={isEventModalOpen}
        isBrowserReady={isBrowserReady}
        eventModalMode={eventModalMode}
        isEventMutationPending={isEventMutationPending}
        isSavingEvent={isSavingEvent}
        isDeletingEvent={isDeletingEvent}
        eventSummary={eventSummary}
        eventAllDay={eventAllDay}
        eventStartDate={eventStartDate}
        eventEndDate={eventEndDate}
        eventStartDateTime={eventStartDateTime}
        eventEndDateTime={eventEndDateTime}
        eventLocation={eventLocation}
        eventDescription={eventDescription}
        eventFormError={eventFormError}
        connectUrl={connectUrl}
        onClose={closeEventModal}
        onSubmit={submitEventForm}
        onDelete={handleDeleteEvent}
        onEventSummaryChange={setEventSummary}
        onEventAllDayChange={setEventAllDay}
        onEventStartDateChange={setEventStartDate}
        onEventEndDateChange={setEventEndDate}
        onEventStartDateTimeChange={setEventStartDateTime}
        onEventEndDateTimeChange={setEventEndDateTime}
        onEventLocationChange={setEventLocation}
        onEventDescriptionChange={setEventDescription}
      />
    </>
  );
}
