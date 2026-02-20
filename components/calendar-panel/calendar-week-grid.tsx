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
  weekDays: Date[];
  eventsByDay: Map<string, DayEventBucket>;
  eventsCount: number;
  onOpenGoogleEvent: (event: CalendarEventItem) => void;
  onOpenEditEventModal: (event: CalendarEventItem) => void;
}

export function CalendarWeekGrid({
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
    <div className="space-y-3 overflow-x-auto">
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
                        <p className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground">
                          {event.summary}
                        </p>
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
                        onOpenEditEventModal(event);
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
                        onOpenEditEventModal(event);
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
                    {content}
                  </article>
                );
              })}
            </section>
          );
        })}
      </div>

      {eventsCount === 0 ? (
        <div className="rounded-md border border-dashed border-border/60 px-4 py-4 text-sm text-muted-foreground">
          No events in the current week.
        </div>
      ) : null}
    </div>
  );
}
