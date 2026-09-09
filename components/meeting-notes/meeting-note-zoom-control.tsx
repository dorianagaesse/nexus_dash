"use client";

import type { CSSProperties } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";

import { Button } from "@/components/ui/button";

export const MEETING_NOTE_ZOOM_MIN = 75;
export const MEETING_NOTE_ZOOM_MAX = 200;
export const MEETING_NOTE_ZOOM_STEP = 25;
export const MEETING_NOTE_ZOOM_DEFAULT = 100;

export function clampMeetingNoteZoom(value: number): number {
  const bounded = Math.min(
    MEETING_NOTE_ZOOM_MAX,
    Math.max(MEETING_NOTE_ZOOM_MIN, value)
  );
  return (
    Math.round((bounded - MEETING_NOTE_ZOOM_MIN) / MEETING_NOTE_ZOOM_STEP) *
      MEETING_NOTE_ZOOM_STEP +
    MEETING_NOTE_ZOOM_MIN
  );
}

export function getMeetingNoteZoomTextStyle(zoom: number): CSSProperties {
  return {
    fontSize: `${(14 * clampMeetingNoteZoom(zoom)) / 100}px`,
    lineHeight: 1.7,
  };
}

interface MeetingNoteZoomControlProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
}

export function MeetingNoteZoomControl({
  label,
  value,
  onChange,
}: MeetingNoteZoomControlProps) {
  const zoom = clampMeetingNoteZoom(value);
  const isAtMinimum = zoom === MEETING_NOTE_ZOOM_MIN;
  const isAtMaximum = zoom === MEETING_NOTE_ZOOM_MAX;

  return (
    <div
      role="group"
      aria-label={`${label} zoom controls`}
      data-meeting-note-zoom={label.toLocaleLowerCase()}
      className="inline-flex shrink-0 items-center overflow-hidden rounded-xl border border-border/70 bg-background"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-11 w-11 shrink-0 rounded-none border-r border-border/60"
        aria-label={`Zoom out ${label}`}
        disabled={isAtMinimum}
        onClick={() =>
          onChange(clampMeetingNoteZoom(zoom - MEETING_NOTE_ZOOM_STEP))
        }
      >
        <ZoomOut className="h-4 w-4" aria-hidden="true" />
      </Button>
      <span
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="min-w-14 px-2 text-center text-xs font-semibold tabular-nums text-foreground"
      >
        {zoom}%
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-11 w-11 shrink-0 rounded-none border-l border-border/60"
        aria-label={`Zoom in ${label}`}
        disabled={isAtMaximum}
        onClick={() =>
          onChange(clampMeetingNoteZoom(zoom + MEETING_NOTE_ZOOM_STEP))
        }
      >
        <ZoomIn className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
