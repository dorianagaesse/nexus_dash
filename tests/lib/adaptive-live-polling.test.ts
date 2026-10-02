import { describe, expect, test } from "vitest";

import {
  MAX_LIVE_POLL_BACKOFF_MS,
  resolveAdaptivePollDelayMs,
} from "@/lib/adaptive-live-polling";

describe("resolveAdaptivePollDelayMs", () => {
  test("uses the active interval while visible and healthy", () => {
    expect(
      resolveAdaptivePollDelayMs({
        activeIntervalMs: 10000,
        isHidden: false,
        consecutiveFailures: 0,
      })
    ).toBe(10000);
  });

  test("pauses periodic polling while hidden", () => {
    expect(
      resolveAdaptivePollDelayMs({
        activeIntervalMs: 10000,
        isHidden: true,
        consecutiveFailures: 0,
      })
    ).toBeNull();

    expect(
      resolveAdaptivePollDelayMs({
        activeIntervalMs: 20000,
        isHidden: true,
        consecutiveFailures: 3,
      })
    ).toBeNull();
  });

  test("backs off exponentially on consecutive failures up to the cap", () => {
    const delayFor = (consecutiveFailures: number) =>
      resolveAdaptivePollDelayMs({
        activeIntervalMs: 10000,
        isHidden: false,
        consecutiveFailures,
      });

    expect(delayFor(1)).toBe(20000);
    expect(delayFor(2)).toBe(40000);
    expect(delayFor(3)).toBe(MAX_LIVE_POLL_BACKOFF_MS);
    expect(delayFor(8)).toBe(MAX_LIVE_POLL_BACKOFF_MS);
  });

  test("never retries faster than the active interval", () => {
    expect(
      resolveAdaptivePollDelayMs({
        activeIntervalMs: 90000,
        isHidden: false,
        consecutiveFailures: 1,
      })
    ).toBe(90000);
  });
});
