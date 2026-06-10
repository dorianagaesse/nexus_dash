"use client";

import { X } from "lucide-react";
import type { CSSProperties, KeyboardEvent } from "react";

import { cn } from "@/lib/utils";

type TokenDelimiter = "Enter" | "," | " ";

interface TokenInputProps {
  id: string;
  value: string[];
  inputValue: string;
  onInputValueChange: (value: string) => void;
  onChange: (value: string[]) => void;
  normalizeToken?: (value: string) => string;
  delimiters?: TokenDelimiter[];
  maxItems?: number;
  maxInputLength?: number;
  placeholder?: string;
  disabled?: boolean;
  tokenClassName?: string;
  getTokenStyle?: (token: string) => CSSProperties;
  inputClassName?: string;
}

function defaultNormalizeToken(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function TokenInput({
  id,
  value,
  inputValue,
  onInputValueChange,
  onChange,
  normalizeToken = defaultNormalizeToken,
  delimiters = ["Enter", ","],
  maxItems,
  maxInputLength = 80,
  placeholder = "Type and press Enter",
  disabled = false,
  tokenClassName,
  getTokenStyle,
  inputClassName,
}: TokenInputProps) {
  const canAddMore = maxItems == null || value.length < maxItems;

  const addToken = (rawToken: string) => {
    if (!canAddMore) {
      onInputValueChange("");
      return;
    }

    const normalizedToken = normalizeToken(rawToken);
    if (!normalizedToken) {
      onInputValueChange("");
      return;
    }

    const alreadyExists = value.some(
      (token) => token.toLocaleLowerCase() === normalizedToken.toLocaleLowerCase()
    );
    if (alreadyExists) {
      onInputValueChange("");
      return;
    }

    onChange([...value, normalizedToken]);
    onInputValueChange("");
  };

  const removeToken = (tokenToRemove: string) => {
    onChange(value.filter((token) => token !== tokenToRemove));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const isDelimiter = delimiters.includes(event.key as TokenDelimiter);
    if (isDelimiter) {
      event.preventDefault();
      addToken(inputValue);
      return;
    }

    if (event.key === "Backspace" && !inputValue && value.length > 0) {
      event.preventDefault();
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div
      className={cn(
        "rounded-md border border-input bg-background p-2 transition focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20",
        disabled ? "opacity-60" : ""
      )}
    >
      <div className="flex min-h-8 flex-wrap items-center gap-2">
        {value.map((token) => (
          <span
            key={token}
            className={cn(
              "inline-flex max-w-full items-center gap-1 rounded-full border border-border/70 bg-muted px-2.5 py-1 text-xs font-semibold text-foreground",
              tokenClassName
            )}
            style={getTokenStyle?.(token)}
          >
            <span className="truncate">{token}</span>
            <button
              type="button"
              className="rounded-sm p-0.5 transition hover:bg-foreground/10"
              onClick={() => removeToken(token)}
              disabled={disabled}
              aria-label={`Remove ${token}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={inputValue}
          onChange={(event) => onInputValueChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => addToken(inputValue)}
          maxLength={maxInputLength}
          disabled={disabled || !canAddMore}
          className={cn(
            "h-8 min-w-[120px] flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground",
            inputClassName
          )}
          placeholder={canAddMore ? placeholder : "Limit reached"}
        />
      </div>
    </div>
  );
}
