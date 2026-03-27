import type { KeyboardEvent } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AttachmentLinkComposerProps {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: () => void | Promise<void>;
  isSubmitDisabled?: boolean;
  placeholder?: string;
  inputClassName?: string;
  className?: string;
}

export function AttachmentLinkComposer({
  value,
  onValueChange,
  onSubmit,
  isSubmitDisabled = false,
  placeholder = "https://...",
  inputClassName,
  className,
}: AttachmentLinkComposerProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();

    if (isSubmitDisabled) {
      return;
    }

    void onSubmit();
  };

  return (
    <div
      className={cn(
        "flex items-center gap-0 overflow-hidden rounded-xl bg-muted/30 ring-1 ring-border/40",
        className
      )}
    >
      <input
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={cn(
          "h-10 flex-1 border-0 bg-transparent px-3 text-xs text-foreground outline-none placeholder:text-muted-foreground/75",
          inputClassName
        )}
      />
      <Button
        type="button"
        size="icon"
        onClick={() => void onSubmit()}
        disabled={isSubmitDisabled}
        aria-label="Add attachment link"
        className="h-10 w-10 shrink-0 rounded-none bg-foreground text-background hover:bg-foreground/90"
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}
