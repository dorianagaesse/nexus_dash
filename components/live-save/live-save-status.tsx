"use client";

import type { LiveSaveSnapshot } from "@/lib/live-save/types";
import { cn } from "@/lib/utils";

/**
 * Renders the ND-432 live-save state labels. A local draft is never labelled
 * "Saved"; while `dirty` the recovery-draft notice already shows the local
 * state, so this component stays silent. `disabled`, `clean`, and
 * `hidden-paused` also render nothing.
 */
export function liveSaveStatusText<F extends Record<string, unknown>>(
  snapshot: LiveSaveSnapshot<F>
): string | null {
  switch (snapshot.phase) {
    case "sending":
      return "Saving changes";
    case "saved":
      return "Saved";
    case "offline-paused":
      return "Offline - draft safe locally";
    case "failed":
      return "Save failed - draft safe locally";
    case "conflict":
      return "Conflict - review changes";
    case "invalid-paused":
      return snapshot.invalidMessage
        ? `Live save paused: ${snapshot.invalidMessage}`
        : "Live save paused until this form is valid";
    case "auth-paused":
      return "Live save paused - your access changed. Your draft is kept in this browser.";
    case "gone-blocked":
      return "Live save stopped - this record is no longer available. Copy your changes before leaving.";
    default:
      return null;
  }
}

export function LiveSaveStatus<F extends Record<string, unknown>>({
  snapshot,
  className,
}: {
  snapshot: LiveSaveSnapshot<F>;
  className?: string;
}) {
  const text = liveSaveStatusText(snapshot);
  if (text === null) return null;
  const isAlert =
    snapshot.phase === "conflict" || snapshot.phase === "gone-blocked";
  return (
    <p
      role="status"
      aria-live="polite"
      data-live-save-phase={snapshot.phase}
      className={cn(
        "rounded-md border border-border bg-muted/50 px-3 py-2 text-sm",
        isAlert && "border-destructive/50 text-destructive",
        className
      )}
    >
      {text}
      {snapshot.phase === "failed" && snapshot.retryAt !== null ? (
        <span> Retrying automatically.</span>
      ) : null}
    </p>
  );
}
