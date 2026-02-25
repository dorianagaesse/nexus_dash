"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AuthSubmitButtonProps = {
  className?: string;
  defaultLabel: string;
  pendingLabel: string;
  variant?: "default" | "secondary";
};

export function AuthSubmitButton({
  className,
  defaultLabel,
  pendingLabel,
  variant = "default",
}: AuthSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className={className} variant={variant} disabled={pending}>
      <span
        aria-hidden
        className={cn(
          "size-3 rounded-full border-2 border-current border-r-transparent transition-opacity",
          pending ? "animate-spin opacity-100" : "opacity-0"
        )}
      />
      {pending ? pendingLabel : defaultLabel}
    </Button>
  );
}
