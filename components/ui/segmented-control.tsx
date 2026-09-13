"use client";

import { cn } from "@/lib/utils";

export interface SegmentedControlOption<Value extends string> {
  value: Value;
  label: string;
}

interface SegmentedControlProps<Value extends string> {
  value: Value;
  options: readonly SegmentedControlOption<Value>[];
  onValueChange: (value: Value) => void;
  ariaLabel: string;
  className?: string;
}

export function SegmentedControl<Value extends string>({
  value,
  options,
  onValueChange,
  ariaLabel,
  className,
}: SegmentedControlProps<Value>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "grid rounded-md border border-border/70 bg-muted/20 p-1",
        className
      )}
      style={{
        gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
      }}
    >
      {options.map((option) => {
        const isSelected = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onValueChange(option.value)}
            className={cn(
              "rounded px-3 py-2 text-sm font-medium transition",
              isSelected
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
