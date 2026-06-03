import { afterEach, describe, expect, test, vi } from "vitest";

import {
  encodeServerSentEvent,
  sleepWithAbort,
} from "@/lib/realtime/server-sent-events";

function createInspectableAbortSignal() {
  const listeners = new Set<EventListener>();
  const signal = {
    aborted: false,
    addEventListener: vi.fn(
      (_type: string, listener: EventListener) => {
        listeners.add(listener);
      }
    ),
    removeEventListener: vi.fn(
      (_type: string, listener: EventListener) => {
        listeners.delete(listener);
      }
    ),
  } as unknown as AbortSignal;

  return {
    listeners,
    signal,
    abort() {
      for (const listener of Array.from(listeners)) {
        listener(new Event("abort"));
      }
    },
  };
}

describe("server-sent-events", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("encodes named JSON events", () => {
    expect(
      encodeServerSentEvent({
        event: "project-activity",
        id: "2026-06-03T00:00:00.000Z",
        retry: 2000,
        data: { projectId: "project-1" },
      })
    ).toBe(
      [
        "retry: 2000",
        "id: 2026-06-03T00:00:00.000Z",
        "event: project-activity",
        'data: {"projectId":"project-1"}',
        "",
        "",
      ].join("\n")
    );
  });

  test("cleans up abort listeners when sleep resolves", async () => {
    vi.useFakeTimers();
    const abort = createInspectableAbortSignal();

    const promise = sleepWithAbort(50, abort.signal);
    expect(abort.listeners.size).toBe(1);

    await vi.advanceTimersByTimeAsync(50);
    await expect(promise).resolves.toBeUndefined();
    expect(abort.listeners.size).toBe(0);
    expect(abort.signal.removeEventListener).toHaveBeenCalledTimes(1);
  });

  test("rejects when the signal aborts", async () => {
    vi.useFakeTimers();
    const abort = createInspectableAbortSignal();

    const promise = sleepWithAbort(50, abort.signal);
    abort.abort();

    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });
});
