"use client";

import { CircleAlert, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function AccountError({ reset }: { reset: () => void }) {
  return (
    <section
      role="alert"
      aria-labelledby="user-hub-error-heading"
      className="rounded-xl border border-destructive/40 bg-destructive/5 p-5 sm:p-6"
    >
      <div className="flex items-start gap-3">
        <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
        <div className="space-y-3">
          <div className="space-y-1">
            <h1 id="user-hub-error-heading" className="text-lg font-semibold">
              This view could not be loaded
            </h1>
            <p className="text-sm text-muted-foreground">
              Your user hub is still available. Retry this view or choose another
              destination above.
            </p>
          </div>
          <Button type="button" variant="outline" className="min-h-11" onClick={reset}>
            <RotateCcw className="h-4 w-4" aria-hidden />
            Retry
          </Button>
        </div>
      </div>
    </section>
  );
}
