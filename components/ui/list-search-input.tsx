"use client";

import { Search, X } from "lucide-react";
import { useRef } from "react";

import { cn } from "@/lib/utils";

interface ListSearchInputProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
  clearAriaLabel: string;
  className?: string;
}

export function ListSearchInput({
  value,
  onValueChange,
  placeholder,
  ariaLabel,
  clearAriaLabel,
  className,
}: ListSearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className={cn("relative min-w-0 flex-1", className)}>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
      />
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        className={cn(
          "h-11 w-full rounded-md border border-input bg-background pl-9 text-sm outline-none transition placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20",
          value ? "pr-10" : "pr-3"
        )}
        placeholder={placeholder}
        aria-label={ariaLabel}
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            inputRef.current?.focus();
            onValueChange("");
          }}
          className="absolute right-2 top-1/2 rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
          aria-label={clearAriaLabel}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
