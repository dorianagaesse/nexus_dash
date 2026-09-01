import { CalendarDays, ExternalLink, Trash2, X } from "lucide-react";

import { CalendarDateTimeField } from "@/components/calendar-date-time-field";
import { Button } from "@/components/ui/button";
import { CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { EmojiInputField, EmojiTextareaField } from "@/components/ui/emoji-field";
import {
  formatCalendarSourceAccount,
  resolveCalendarVisualColor,
  type CalendarEventItem,
  type CalendarSourceOption,
} from "@/components/project-calendar-panel-utils";

interface CalendarEventModalProps {
  isOpen: boolean;
  isBrowserReady: boolean;
  eventModalMode: "create" | "edit" | "view";
  isEventMutationPending: boolean;
  isSavingEvent: boolean;
  isDeletingEvent: boolean;
  eventSummary: string;
  eventAllDay: boolean;
  eventStartDate: string;
  eventEndDate: string;
  eventStartDateTime: string;
  eventEndDateTime: string;
  eventLocation: string;
  eventDescription: string;
  calendarSources: CalendarSourceOption[];
  eventCalendarSourceId: string;
  selectedEvent: CalendarEventItem | null;
  eventFormError: string | null;
  connectUrl: string;
  onClose: () => void;
  onSubmit: () => void | Promise<void>;
  onDelete: () => void | Promise<void>;
  onEventSummaryChange: (value: string) => void;
  onEventAllDayChange: (value: boolean) => void;
  onEventStartDateChange: (value: string) => void;
  onEventEndDateChange: (value: string) => void;
  onEventStartDateTimeChange: (value: string) => void;
  onEventEndDateTimeChange: (value: string) => void;
  onEventLocationChange: (value: string) => void;
  onEventDescriptionChange: (value: string) => void;
  onEventCalendarSourceIdChange: (value: string) => void;
}

export function CalendarEventModal({
  isOpen,
  isBrowserReady,
  eventModalMode,
  isEventMutationPending,
  isSavingEvent,
  isDeletingEvent,
  eventSummary,
  eventAllDay,
  eventStartDate,
  eventEndDate,
  eventStartDateTime,
  eventEndDateTime,
  eventLocation,
  eventDescription,
  calendarSources,
  eventCalendarSourceId,
  selectedEvent,
  eventFormError,
  connectUrl,
  onClose,
  onSubmit,
  onDelete,
  onEventSummaryChange,
  onEventAllDayChange,
  onEventStartDateChange,
  onEventEndDateChange,
  onEventStartDateTimeChange,
  onEventEndDateTimeChange,
  onEventLocationChange,
  onEventDescriptionChange,
  onEventCalendarSourceIdChange,
}: CalendarEventModalProps) {
  if (!isBrowserReady || !isOpen) {
    return null;
  }

  const selectedSource =
    calendarSources.find((source) => source.id === eventCalendarSourceId) ?? null;
  const isReadOnly = eventModalMode === "view";
  const controlsDisabled = isEventMutationPending || isReadOnly;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isEventMutationPending) {
          onClose();
        }
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        data-calendar-popover-scope="true"
        dismissible={!isEventMutationPending}
        className="flex max-h-[100dvh] w-full max-w-lg flex-col overflow-hidden sm:max-h-[calc(100dvh-2rem)]"
      >
        <CardHeader className="flex shrink-0 flex-row items-center justify-between space-y-0">
          <DialogTitle className="text-lg">
            {eventModalMode === "create"
              ? "Create calendar event"
              : eventModalMode === "edit"
                ? "Edit calendar event"
                : "Calendar event"}
          </DialogTitle>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            disabled={isEventMutationPending}
            aria-label="Close calendar event"
          >
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 overflow-y-auto">
          <p className="mb-3 text-xs text-muted-foreground">
            Saves to your selected Google Calendar, not to a shared NexusDash
            project schedule.
          </p>
          <form
            className="grid gap-4"
            onSubmit={(submitEvent) => {
              submitEvent.preventDefault();
              void onSubmit();
            }}
          >
            {eventModalMode === "create" ? (
              <div className="grid gap-2">
                <label htmlFor="calendar-event-source" className="text-sm font-medium">
                  Calendar
                </label>
                <select
                  id="calendar-event-source"
                  value={eventCalendarSourceId}
                  onChange={(event) => onEventCalendarSourceIdChange(event.target.value)}
                  disabled={isEventMutationPending}
                  required
                  className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="" disabled>Select a writable calendar</option>
                  {calendarSources.filter((source) => source.writable).map((source) => (
                    <option key={source.id} value={source.id}>
                      {source.name} — {formatCalendarSourceAccount(source)}
                    </option>
                  ))}
                </select>
              </div>
            ) : selectedSource ? (
              <section
                className="flex items-start gap-3 rounded-lg border border-border/70 bg-muted/20 px-3 py-3"
                aria-label="Event calendar source"
              >
                <span
                  aria-hidden
                  className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-foreground/15 bg-background"
                >
                  <CalendarDays
                    className="h-4 w-4"
                    style={{
                      color: resolveCalendarVisualColor(selectedSource.id, selectedSource.color),
                    }}
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Calendar
                  </p>
                  <p className="break-words text-sm font-semibold text-foreground">
                    {selectedSource.name}
                  </p>
                  <p className="break-words text-xs text-muted-foreground">
                    {formatCalendarSourceAccount(selectedSource)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {isReadOnly
                      ? "This calendar is read only in NexusDash."
                      : "Existing events stay in their originating calendar."}
                  </p>
                </div>
              </section>
            ) : null}

            <div className="grid gap-2">
              <label htmlFor="calendar-event-summary" className="text-sm font-medium">
                Title
              </label>
              <EmojiInputField
                id="calendar-event-summary"
                autoFocus={!isReadOnly}
                value={eventSummary}
                onChange={(event) => onEventSummaryChange(event.target.value)}
                minLength={1}
                maxLength={200}
                required
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                placeholder="Weekly planning"
                disabled={controlsDisabled}
              />
            </div>

            <label className="inline-flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={eventAllDay}
                onChange={(event) => onEventAllDayChange(event.target.checked)}
                className="h-4 w-4 rounded border-input"
                disabled={controlsDisabled}
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
                    onChange={onEventStartDateChange}
                    includeTime={false}
                    disabled={controlsDisabled}
                  />
                </div>
                <div className="grid gap-2">
                  <label htmlFor="calendar-event-end-date" className="text-sm font-medium">
                    End date
                  </label>
                  <CalendarDateTimeField
                    id="calendar-event-end-date"
                    value={eventEndDate}
                    onChange={onEventEndDateChange}
                    includeTime={false}
                    disabled={controlsDisabled}
                  />
                </div>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <label
                    htmlFor="calendar-event-start-date-time"
                    className="text-sm font-medium"
                  >
                    Start
                  </label>
                  <CalendarDateTimeField
                    id="calendar-event-start-date-time"
                    value={eventStartDateTime}
                    onChange={onEventStartDateTimeChange}
                    includeTime
                    disabled={controlsDisabled}
                  />
                </div>
                <div className="grid gap-2">
                  <label htmlFor="calendar-event-end-date-time" className="text-sm font-medium">
                    End
                  </label>
                  <CalendarDateTimeField
                    id="calendar-event-end-date-time"
                    value={eventEndDateTime}
                    onChange={onEventEndDateTimeChange}
                    includeTime
                    disabled={controlsDisabled}
                  />
                </div>
              </div>
            )}

            <div className="grid gap-2">
              <label htmlFor="calendar-event-location" className="text-sm font-medium">
                Location (optional)
              </label>
              <EmojiInputField
                id="calendar-event-location"
                value={eventLocation}
                onChange={(event) => onEventLocationChange(event.target.value)}
                maxLength={200}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                placeholder="Office / Video call / Address"
                disabled={controlsDisabled}
              />
            </div>

            <div className="grid gap-2">
              <label htmlFor="calendar-event-description" className="text-sm font-medium">
                Description (optional)
              </label>
              <EmojiTextareaField
                id="calendar-event-description"
                value={eventDescription}
                onChange={(event) => onEventDescriptionChange(event.target.value)}
                maxLength={4000}
                rows={4}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="Event details..."
                disabled={controlsDisabled}
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

            <div
              data-calendar-popover-footer-boundary="true"
              className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:items-center"
            >
              {eventModalMode === "edit" ? (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => void onDelete()}
                  disabled={isEventMutationPending}
                  className="w-full sm:w-auto"
                >
                  <Trash2 className="h-4 w-4" />
                  {isDeletingEvent ? "Deleting..." : "Delete event"}
                </Button>
              ) : null}
              {eventModalMode !== "view" ? (
                <Button
                  type="submit"
                  disabled={isEventMutationPending}
                  className="w-full sm:w-auto"
                >
                  {isSavingEvent
                    ? eventModalMode === "create"
                      ? "Creating..."
                      : "Saving..."
                    : eventModalMode === "create"
                      ? "Create event"
                      : "Save changes"}
                </Button>
              ) : null}
              {selectedEvent?.htmlLink ? (
                <Button type="button" variant="outline" asChild className="w-full sm:w-auto">
                  <a href={selectedEvent.htmlLink} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    Open in Google Calendar
                  </a>
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                disabled={isEventMutationPending}
                className="w-full sm:w-auto"
              >
                {eventModalMode === "view" ? "Close" : "Cancel"}
              </Button>
            </div>
          </form>
        </CardContent>
      </DialogContent>
    </Dialog>
  );
}
