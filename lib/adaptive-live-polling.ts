export const MAX_LIVE_POLL_BACKOFF_MS = 60_000;

interface AdaptivePollDelayInput {
  activeIntervalMs: number;
  isHidden: boolean;
  consecutiveFailures: number;
}

export function resolveAdaptivePollDelayMs({
  activeIntervalMs,
  isHidden,
  consecutiveFailures,
}: AdaptivePollDelayInput): number | null {
  if (isHidden) {
    return null;
  }

  if (consecutiveFailures <= 0) {
    return activeIntervalMs;
  }

  const backoffMs = activeIntervalMs * 2 ** consecutiveFailures;

  return Math.max(activeIntervalMs, Math.min(backoffMs, MAX_LIVE_POLL_BACKOFF_MS));
}
