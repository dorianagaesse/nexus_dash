"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  buildCalendarGrid,
  formatPickerFieldValue,
  isSameDate,
  parseDateInputValue,
  parseDateTimeInputValue,
  toDateInputValue,
  toDateTimeLocalInputValue,
  toMonthStart,
} from "@/components/project-calendar-panel-utils";
import { cn } from "@/lib/utils";

const PICKER_WIDTH = 320;
const PICKER_GUTTER = 12;
const PICKER_OFFSET = 4;

export interface CalendarDateTimeFieldProps {
  id: string;
  value: string;
  onChange: (nextValue: string) => void;
  includeTime: boolean;
  disabled: boolean;
}

export function CalendarDateTimeField({
  id,
  value,
  onChange,
  includeTime,
  disabled,
}: CalendarDateTimeFieldProps) {
  const [isBrowserReady, setIsBrowserReady] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<{
    left: number;
    width: number;
    top?: number;
    bottom?: number;
  } | null>(null);

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
    setIsBrowserReady(true);
  }, []);

  const updatePopoverPosition = useCallback(() => {
    if (!triggerRef.current || typeof window === "undefined") {
      return;
    }

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const width = Math.min(PICKER_WIDTH, viewportWidth - PICKER_GUTTER * 2);
    const left = Math.min(
      Math.max(PICKER_GUTTER, triggerRect.left),
      viewportWidth - width - PICKER_GUTTER
    );
    const estimatedPopoverHeight = includeTime ? 396 : 320;
    const spaceBelow = viewportHeight - triggerRect.bottom - PICKER_GUTTER;
    const spaceAbove = triggerRect.top - PICKER_GUTTER;
    const shouldOpenAbove = spaceBelow < estimatedPopoverHeight && spaceAbove > spaceBelow;

    setPopoverPosition({
      left,
      width,
      ...(shouldOpenAbove
        ? {
            bottom: viewportHeight - triggerRect.top + PICKER_OFFSET,
          }
        : {
            top: triggerRect.bottom + PICKER_OFFSET,
          }),
    });
  }, [includeTime]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setVisibleMonth(toMonthStart(selectedDate));
    updatePopoverPosition();
  }, [isOpen, selectedDate, updatePopoverPosition]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const eventTarget = event.target as Node;

      if (
        wrapperRef.current?.contains(eventTarget) ||
        popoverRef.current?.contains(eventTarget)
      ) {
        return;
      }

      setIsOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", updatePopoverPosition);
    document.addEventListener("scroll", updatePopoverPosition, true);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", updatePopoverPosition);
      document.removeEventListener("scroll", updatePopoverPosition, true);
    };
  }, [isOpen, updatePopoverPosition]);

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

  const pickerPopover =
    isOpen && isBrowserReady && popoverPosition
      ? createPortal(
          <div
            ref={popoverRef}
            data-calendar-popover="true"
            className="fixed z-[120] max-h-[calc(100vh-24px)] overflow-y-auto rounded-md border border-border/70 bg-popover p-3 shadow-xl"
            style={popoverPosition}
          >
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
          </div>,
          document.body
        )
      : null;

  return (
    <div ref={wrapperRef} className="relative">
      <button
        id={id}
        ref={triggerRef}
        type="button"
        className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-left text-sm transition hover:bg-muted/40"
        disabled={disabled}
        onClick={() => setIsOpen((previous) => !previous)}
      >
        <span className="truncate">{formatPickerFieldValue(value, includeTime)}</span>
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
      </button>
      {pickerPopover}
    </div>
  );
}
