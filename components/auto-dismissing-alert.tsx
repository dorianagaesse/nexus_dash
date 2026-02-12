"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

interface AutoDismissingAlertProps {
  message: string;
  durationMs?: number;
  className?: string;
}

export function AutoDismissingAlert({
  message,
  durationMs = 4500,
  className,
}: AutoDismissingAlertProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    setIsVisible(true);
    const timeout = window.setTimeout(() => {
      setIsVisible(false);
    }, durationMs);

    return () => window.clearTimeout(timeout);
  }, [durationMs, message]);

  if (!isVisible) {
    return null;
  }

  return <div className={cn(className)}>{message}</div>;
}
