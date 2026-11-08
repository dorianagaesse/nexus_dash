"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DialogCloseButton({
  onClick,
  disabled,
  label,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      disabled={disabled}
      className="absolute right-3 top-3"
      onClick={onClick}
    >
      <X className="h-4 w-4" />
    </Button>
  );
}
