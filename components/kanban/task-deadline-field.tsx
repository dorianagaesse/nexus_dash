"use client";

import { CalendarDateTimeField } from "@/components/calendar-date-time-field";
import { Button } from "@/components/ui/button";

interface TaskDeadlineFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  name?: string;
  helperText?: string;
}

export function TaskDeadlineField({
  id,
  label,
  value,
  onChange,
  disabled = false,
  name,
  helperText = "Optional. Close deadlines are highlighted automatically on the board.",
}: TaskDeadlineFieldProps) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {value ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto px-2 py-1 text-xs"
            onClick={() => onChange("")}
            disabled={disabled}
          >
            Clear
          </Button>
        ) : null}
      </div>
      <CalendarDateTimeField
        id={id}
        value={value}
        onChange={onChange}
        includeTime={false}
        disabled={disabled}
      />
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <p className="text-xs text-muted-foreground">{helperText}</p>
    </div>
  );
}
