import {
  useRef,
  type ClipboardEvent,
  type FocusEvent,
  type KeyboardEvent,
} from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { normalizeAttachmentUrl } from "@/lib/task-attachment";
import { cn } from "@/lib/utils";

interface AttachmentLinkComposerProps {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: (urlOverride?: string) => void | Promise<void>;
  isSubmitDisabled?: boolean;
  placeholder?: string;
  inputClassName?: string;
  className?: string;
  autoConfirmOnBlur?: boolean;
  autoConfirmOnPaste?: boolean;
}

export function AttachmentLinkComposer({
  value,
  onValueChange,
  onSubmit,
  isSubmitDisabled = false,
  placeholder = "https://...",
  inputClassName,
  className,
  autoConfirmOnBlur = true,
  autoConfirmOnPaste = true,
}: AttachmentLinkComposerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();

    if (isSubmitDisabled) {
      return;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }

    const normalized = normalizeAttachmentUrl(trimmed) || trimmed;
    void onSubmit(normalized);
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    if (!autoConfirmOnBlur || isSubmitDisabled) {
      return;
    }

    // If focus shifted to an element inside this composer (e.g. the '+' button), let the button handle it
    const relatedTarget = event.relatedTarget as Node | null;
    if (containerRef.current && relatedTarget && containerRef.current.contains(relatedTarget)) {
      return;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }

    const normalized = normalizeAttachmentUrl(trimmed);
    if (normalized) {
      void onSubmit(normalized);
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    if (!autoConfirmOnPaste || isSubmitDisabled) {
      return;
    }

    const pastedText = event.clipboardData?.getData("text")?.trim();
    if (!pastedText) {
      return;
    }

    const normalized = normalizeAttachmentUrl(pastedText);
    if (normalized) {
      event.preventDefault();
      onValueChange(normalized);
      void onSubmit(normalized);
    }
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex w-full min-w-0 max-w-full items-center gap-0 overflow-hidden rounded-xl bg-muted/30 ring-1 ring-border/40",
        className
      )}
    >
      <input
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onPaste={handlePaste}
        placeholder={placeholder}
        className={cn(
          "h-10 min-w-0 flex-1 border-0 bg-transparent px-3 text-xs text-foreground outline-none placeholder:text-muted-foreground/75",
          inputClassName
        )}
      />
      <Button
        type="button"
        size="icon"
        onClick={() => {
          if (isSubmitDisabled) {
            return;
          }
          const trimmed = value.trim();
          if (!trimmed) {
            return;
          }
          const normalized = normalizeAttachmentUrl(trimmed) || trimmed;
          void onSubmit(normalized);
        }}
        disabled={isSubmitDisabled}
        aria-label="Add attachment link"
        className="h-10 w-10 shrink-0 rounded-none bg-foreground text-background hover:bg-foreground/90"
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}
