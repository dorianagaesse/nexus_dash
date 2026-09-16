"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

const DEFAULT_POLL_INTERVAL_MS = 4000;
const HIDDEN_POLL_INTERVAL_MS = 15000;
const VERIFICATION_STATUS_PATH = "/api/auth/verify-email/status";

interface VerificationStatusWatcherProps {
  returnToPath: string;
  pollIntervalMs?: number;
}

function resolveNextPollIntervalMs(activePollIntervalMs: number): number {
  if (typeof document !== "undefined" && document.hidden) {
    return Math.max(HIDDEN_POLL_INTERVAL_MS, activePollIntervalMs * 4);
  }

  return activePollIntervalMs;
}

export function VerificationStatusWatcher({
  returnToPath,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
}: VerificationStatusWatcherProps) {
  const [isWatching, setIsWatching] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let controller: AbortController | null = null;
    let isPolling = false;
    let pollAgainAfterCurrent = false;

    setIsWatching(true);

    function clearScheduledPoll() {
      if (!timeoutId) {
        return;
      }

      clearTimeout(timeoutId);
      timeoutId = null;
    }

    function schedulePoll(delayMs = resolveNextPollIntervalMs(pollIntervalMs)) {
      clearScheduledPoll();
      timeoutId = setTimeout(pollStatus, delayMs);
    }

    function requestImmediatePoll() {
      if (typeof document !== "undefined" && document.hidden) {
        return;
      }

      if (isPolling) {
        pollAgainAfterCurrent = true;
        return;
      }

      schedulePoll(0);
    }

    async function pollStatus() {
      timeoutId = null;
      isPolling = true;
      controller?.abort();
      controller = new AbortController();

      try {
        const response = await fetch(VERIFICATION_STATUS_PATH, {
          cache: "no-store",
          signal: controller.signal,
        });

        if (response.ok) {
          const payload = (await response.json()) as { isVerified?: boolean };
          if (payload.isVerified === true) {
            cancelled = true;
            setIsRedirecting(true);
            verificationStatusWatcherInternals.assignLocation(returnToPath);
            return;
          }
        }
      } catch (error) {
        if ((error as { name?: string }).name !== "AbortError") {
          console.warn("[VerificationStatusWatcher.poll]", error);
        }
      } finally {
        isPolling = false;
        if (!cancelled) {
          if (pollAgainAfterCurrent) {
            pollAgainAfterCurrent = false;
            schedulePoll(0);
          } else {
            schedulePoll();
          }
        }
      }
    }

    schedulePoll(0);
    document.addEventListener("visibilitychange", requestImmediatePoll);
    window.addEventListener("focus", requestImmediatePoll);

    return () => {
      cancelled = true;
      clearScheduledPoll();
      controller?.abort();
      document.removeEventListener("visibilitychange", requestImmediatePoll);
      window.removeEventListener("focus", requestImmediatePoll);
    };
  }, [pollIntervalMs, returnToPath]);

  const isVisible = isWatching || isRedirecting;

  return (
    <p
      role="status"
      className="flex min-h-5 items-center gap-2 text-sm text-muted-foreground"
    >
      <span
        aria-hidden
        className={cn(
          "size-3 shrink-0 rounded-full border-2 border-current border-r-transparent animate-spin motion-reduce:animate-none",
          !isVisible && "hidden"
        )}
      />
      {isRedirecting
        ? "Email verified. Redirecting..."
        : isWatching
          ? "This page will continue automatically once your email is verified."
          : null}
    </p>
  );
}

export const verificationStatusWatcherInternals = {
  assignLocation(path: string): void {
    window.location.assign(path);
  },
  resolveNextPollIntervalMs,
};
