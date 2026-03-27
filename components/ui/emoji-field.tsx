"use client";

import * as React from "react";

import { EmojiPickerButton } from "@/components/ui/emoji-picker-button";
import type { EditableTextElement } from "@/lib/emoji-input";
import { insertEmojiAtCursor } from "@/lib/emoji-input";
import { cn } from "@/lib/utils";

type EmojiFieldTargetRef = React.RefObject<EditableTextElement>;

interface EmojiFieldShellProps {
  targetRef: EmojiFieldTargetRef;
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
  buttonPlacement?: "center" | "top";
}

function assignRef<T>(ref: React.ForwardedRef<T>, value: T | null) {
  if (typeof ref === "function") {
    ref(value);
    return;
  }

  if (ref) {
    ref.current = value;
  }
}

export function EmojiFieldShell({
  targetRef,
  children,
  disabled = false,
  className,
  buttonPlacement = "center",
}: EmojiFieldShellProps) {
  const [isPickerOpen, setIsPickerOpen] = React.useState(false);

  return (
    <div
      className={cn(
        "group/emoji relative w-full",
        className
      )}
      data-picker-open={isPickerOpen ? "true" : "false"}
    >
      {children}
      <EmojiPickerButton
        presentation="field"
        className={cn(
          "pointer-events-none absolute z-10 opacity-0 transition-opacity group-focus-within/emoji:pointer-events-auto group-focus-within/emoji:opacity-100 group-data-[picker-open=true]/emoji:pointer-events-auto group-data-[picker-open=true]/emoji:opacity-100",
          buttonPlacement === "center"
            ? "right-2 top-1/2 -translate-y-1/2"
            : "right-2 top-2"
        )}
        onSelectEmoji={(emoji) => insertEmojiAtCursor(targetRef.current, emoji)}
        disabled={disabled}
        onOpenChange={setIsPickerOpen}
      />
    </div>
  );
}

type EmojiInputFieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  wrapperClassName?: string;
};

export const EmojiInputField = React.forwardRef<HTMLInputElement, EmojiInputFieldProps>(
  ({ className, wrapperClassName, disabled = false, ...props }, forwardedRef) => {
    const inputRef = React.useRef<HTMLInputElement | null>(null);

    return (
      <EmojiFieldShell
        targetRef={inputRef as EmojiFieldTargetRef}
        disabled={disabled}
        className={wrapperClassName}
      >
        <input
          {...props}
          disabled={disabled}
          ref={(node) => {
            inputRef.current = node;
            assignRef(forwardedRef, node);
          }}
          className={cn("block w-full", className, "pr-12")}
        />
      </EmojiFieldShell>
    );
  }
);
EmojiInputField.displayName = "EmojiInputField";

type EmojiTextareaFieldProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  wrapperClassName?: string;
};

export const EmojiTextareaField = React.forwardRef<
  HTMLTextAreaElement,
  EmojiTextareaFieldProps
>(({ className, wrapperClassName, disabled = false, ...props }, forwardedRef) => {
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  return (
    <EmojiFieldShell
      targetRef={textareaRef as EmojiFieldTargetRef}
      disabled={disabled}
      className={wrapperClassName}
      buttonPlacement="top"
    >
      <textarea
        {...props}
        disabled={disabled}
        ref={(node) => {
          textareaRef.current = node;
          assignRef(forwardedRef, node);
        }}
        className={cn("block w-full", className, "pr-12")}
      />
    </EmojiFieldShell>
  );
});
EmojiTextareaField.displayName = "EmojiTextareaField";
