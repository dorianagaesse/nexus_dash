import { Pencil } from "lucide-react";

import {
  buildTimedEventLayout,
  CALENDAR_COMPACT_EVENT_HEIGHT_PX,
  CALENDAR_DAY_END_HOUR,
  CALENDAR_DAY_START_HOUR,
  CALENDAR_HOUR_CELL_HEIGHT_PX,
  CALENDAR_TOTAL_GRID_HEIGHT_PX,
  formatDayHeader,
  formatEventStartTimeLabel,
  formatEventTimeLabel,
  formatHourLabel,
  toDateKey,
  type CalendarEventItem,
  type DayEventBucket,
} from "@/components/project-calendar-panel-utils";
import { cn } from "@/lib/utils";

interface CalendarWeekGridProps {
  canEdit: boolean;
  weekDays: Date[];
  eventsByDay: Map<string, DayEventBucket>;
  eventsCount: number;
  onOpenGoogleEvent: (event: CalendarEventItem) => void;
  onOpenEditEventModal: (event: CalendarEventItem) => void;
}

export function CalendarWeekGrid({
  canEdit,
  weekDays,
  eventsByDay,
  eventsCount,
  onOpenGoogleEvent,
  onOpenEditEventModal,
}: CalendarWeekGridProps) {
  if (weekDays.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border/60 px-4 py-6 text-sm text-muted-foreground">
        Could not resolve the current week window.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-3 md:hidden">
        {weekDays.map((day) => {
          const dayKey = toDateKey(day);
          const dayBucket = eventsByDay.get(dayKey);
          const allDayEvents = dayBucket?.allDay ?? [];
          const timedEvents = dayBucket?.timed ?? [];
          const dayEventCount = allDayEvents.length + timedEvents.length;

          return (
            <section
              key={`mobile-${dayKey}`}
              className="rounded-xl border border-border/60 bg-background px-3 py-3"
            >
              <header className="mb-3 flex items-center justify-between gap-2 border-b border-border/60 pb-2">
                <p className="text-sm font-medium text-foreground">{formatDayHeader(day)}</p>
                <span className="text-[11px] text-muted-foreground">
                  {dayEventCount} event{dayEventCount === 1 ? "" : "s"}
                </span>
              </header>

              <div className="space-y-2">
                {allDayEvents.map((event) => (
                  <MobileCalendarEventCard
                    key={event.id}
                    event={event}
                    canEdit={canEdit}
                    label="All day"
                    onOpenGoogleEvent={onOpenGoogleEvent}
                    onOpenEditEventModal={onOpenEditEventModal}
                  />
                ))}
                {timedEvents.map((event) => (
                  <MobileCalendarEventCard
                    key={event.id}
                    event={event}
                    canEdit={canEdit}
                    label={formatEventTimeLabel(event)}
                    onOpenGoogleEvent={onOpenGoogleEvent}
                    onOpenEditEventModal={onOpenEditEventModal}
                  />
                ))}
                {dayEventCount === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {eventsCount === 0
                      ? "No events scheduled this week."
                      : "No events scheduled."}
                  </p>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>

      <div className="hidden space-y-3 md:block">
        <div className="overflow-x-auto">
          <div className="grid min-w-[1180px] grid-cols-[80px_repeat(7,minmax(0,1fr))] gap-2">
            <div className="pt-1 text-[11px] font-medium text-muted-foreground">All day</div>
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
                    <p className="text-xs font-medium text-foreground">{formatDayHeader(day)}</p>
                  </header>
                  <div className="space-y-1">
                    {allDayEvents.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground">No all-day events</p>
                    ) : (
                      allDayEvents.map((event) => (
                        <DesktopAllDayEventChip
                          key={event.id}
                          event={event}
                          canEdit={canEdit}
                          onOpenGoogleEvent={onOpenGoogleEvent}
                          onOpenEditEventModal={onOpenEditEventModal}
                        />
                      ))
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="grid min-w-[1180px] grid-cols-[80px_repeat(7,minmax(0,1fr))] gap-2">
            <div
              className="relative rounded-md border border-border/60 bg-muted/20"
              style={{ height: `${CALENDAR_TOTAL_GRID_HEIGHT_PX}px` }}
            >
              {Array.from(
                {
                  length: CALENDAR_DAY_END_HOUR - CALENDAR_DAY_START_HOUR + 1,
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
                      length: CALENDAR_DAY_END_HOUR - CALENDAR_DAY_START_HOUR + 1,
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

                    const isCompactEvent = layout.heightPx < CALENDAR_COMPACT_EVENT_HEIGHT_PX;
                    const canOpen = Boolean(event.htmlLink);
                    const eventTitle = `${event.summary} - ${formatEventTimeLabel(event)}`;
                    const style = {
                      top: `${layout.topPx}px`,
                      height: `${layout.heightPx}px`,
                    };

                    return (
                      <article
                        key={event.id}
                        title={eventTitle}
                        className={cn(
                          "absolute left-1 right-1 overflow-hidden rounded-md border border-sky-500/40 bg-sky-500/10 px-1.5 py-1",
                          canOpen ? "cursor-pointer transition hover:bg-sky-500/20" : ""
                        )}
                        style={style}
                        onClick={() => onOpenGoogleEvent(event)}
                        onKeyDown={(keyboardEvent) => {
                          if (
                            canOpen &&
                            (keyboardEvent.key === "Enter" || keyboardEvent.key === " ")
                          ) {
                            keyboardEvent.preventDefault();
                            onOpenGoogleEvent(event);
                          }
                        }}
                        role={canOpen ? "button" : undefined}
                        tabIndex={canOpen ? 0 : undefined}
                      >
                        {isCompactEvent ? (
                          <div className="flex min-w-0 items-center gap-1">
                            <p className="min-w-0 flex-1 truncate text-[10px] font-medium text-foreground">
                              {event.summary}
                            </p>
                            <span className="shrink-0 text-[10px] text-muted-foreground">
                              {formatEventStartTimeLabel(event)}
                            </span>
                            {canEdit ? (
                              <button
                                type="button"
                                onClick={(mouseEvent) => {
                                  mouseEvent.stopPropagation();
                                  onOpenEditEventModal(event);
                                }}
                                className="shrink-0 rounded p-0.5 text-muted-foreground transition hover:bg-sky-500/20 hover:text-foreground"
                                aria-label="Edit calendar event"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                            ) : null}
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
                            {canEdit ? (
                              <button
                                type="button"
                                onClick={(mouseEvent) => {
                                  mouseEvent.stopPropagation();
                                  onOpenEditEventModal(event);
                                }}
                                className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground transition hover:bg-sky-500/20 hover:text-foreground"
                                aria-label="Edit calendar event"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                            ) : null}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </section>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function DesktopAllDayEventChip({
  event,
  canEdit,
  onOpenGoogleEvent,
  onOpenEditEventModal,
}: {
  event: CalendarEventItem;
  canEdit: boolean;
  onOpenGoogleEvent: (event: CalendarEventItem) => void;
  onOpenEditEventModal: (event: CalendarEventItem) => void;
}) {
  const canOpen = Boolean(event.htmlLink);
  const eventTitle = `${event.summary} - ${formatEventTimeLabel(event)}`;

  return (
    <article
      className={cn(
        "flex items-center gap-1 rounded border border-border/60 bg-muted/20 px-2 py-1",
        canOpen ? "cursor-pointer transition hover:bg-muted/30" : ""
      )}
      title={eventTitle}
      onClick={() => onOpenGoogleEvent(event)}
      onKeyDown={(keyboardEvent) => {
        if (canOpen && (keyboardEvent.key === "Enter" || keyboardEvent.key === " ")) {
          keyboardEvent.preventDefault();
          onOpenGoogleEvent(event);
        }
      }}
      role={canOpen ? "button" : undefined}
      tabIndex={canOpen ? 0 : undefined}
    >
      <p className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground">
        {event.summary}
      </p>
      {canEdit ? (
        <button
          type="button"
          onClick={(mouseEvent) => {
            mouseEvent.stopPropagation();
            onOpenEditEventModal(event);
          }}
          className="rounded p-0.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
          aria-label="Edit calendar event"
        >
          <Pencil className="h-3 w-3" />
        </button>
      ) : null}
    </article>
  );
}

function MobileCalendarEventCard({
  event,
  canEdit,
  label,
  onOpenGoogleEvent,
  onOpenEditEventModal,
}: {
  event: CalendarEventItem;
  canEdit: boolean;
  label: string;
  onOpenGoogleEvent: (event: CalendarEventItem) => void;
  onOpenEditEventModal: (event: CalendarEventItem) => void;
}) {
  const canOpen = Boolean(event.htmlLink);

  return (
    <article
      className={cn(
        "rounded-lg border border-border/60 bg-muted/20 px-3 py-2",
        canOpen ? "cursor-pointer transition hover:bg-muted/30" : ""
      )}
      onClick={() => onOpenGoogleEvent(event)}
      onKeyDown={(keyboardEvent) => {
        if (canOpen && (keyboardEvent.key === "Enter" || keyboardEvent.key === " ")) {
          keyboardEvent.preventDefault();
          onOpenGoogleEvent(event);
        }
      }}
      role={canOpen ? "button" : undefined}
      tabIndex={canOpen ? 0 : undefined}
      title={`${event.summary} - ${label}`}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {label}
          </p>
          <p className="break-words text-sm font-medium text-foreground">{event.summary}</p>
          {event.location ? (
            <p className="text-xs text-muted-foreground">{event.location}</p>
          ) : null}
        </div>
        {canEdit ? (
          <button
            type="button"
            onClick={(mouseEvent) => {
              mouseEvent.stopPropagation();
              onOpenEditEventModal(event);
            }}
            className="mt-0.5 shrink-0 rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label="Edit calendar event"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
    </article>
  );
}
