import { createPortal } from "react-dom";
import { Trash2, X } from "lucide-react";

import { CalendarDateTimeField } from "@/components/calendar-date-time-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface CalendarEventModalProps {
  isOpen: boolean;
  isBrowserReady: boolean;
  eventModalMode: "create" | "edit";
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
}: CalendarEventModalProps) {
  if (!isBrowserReady || !isOpen) {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onMouseDown={(mouseEvent) => {
        if (mouseEvent.target === mouseEvent.currentTarget) {
          onClose();
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
            onClick={onClose}
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
              void onSubmit();
            }}
          >
            <div className="grid gap-2">
              <label htmlFor="calendar-event-summary" className="text-sm font-medium">
                Title
              </label>
              <input
                id="calendar-event-summary"
                value={eventSummary}
                onChange={(event) => onEventSummaryChange(event.target.value)}
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
                onChange={(event) => onEventAllDayChange(event.target.checked)}
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
                    onChange={onEventStartDateChange}
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
                    onChange={onEventEndDateChange}
                    includeTime={false}
                    disabled={isEventMutationPending}
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
                    onChange={onEventEndDateTimeChange}
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
                onChange={(event) => onEventLocationChange(event.target.value)}
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
                onChange={(event) => onEventDescriptionChange(event.target.value)}
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
                  onClick={() => void onDelete()}
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
                onClick={onClose}
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
  );
}
