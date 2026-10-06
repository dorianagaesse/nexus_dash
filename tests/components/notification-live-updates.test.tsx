// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { NotificationLiveUpdates } from "@/components/notification-live-updates";
import {
  NOTIFICATION_REALTIME_EVENT,
} from "@/lib/notification-realtime-client";
import { MockBroadcastChannel } from "../helpers/mock-broadcast-channel";

const fetchMock = vi.hoisted(() => vi.fn());

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function createTestRenderer() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  return {
    container,
    root,
  };
}

async function renderWithRoot(root: Root, ui: React.ReactElement) {
  await act(async () => {
    root.render(ui);
  });
}

// Claim jitter is consumed in mount order: the first tab waits the longest,
// so the second tab wins the election deterministically.
function stubJitterSequence(values: number[]) {
  let index = 0;
  vi.spyOn(Math, "random").mockImplementation(() =>
    index < values.length ? values[index++] : 0
  );
}

const initialSnapshot = {
  version: "2026-06-04T10:00:00.000Z",
  unreadCount: 0,
  latestUnreadNotification: null,
  serverTime: "2026-06-04T10:00:00.000Z",
};

describe("NotificationLiveUpdates", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("BroadcastChannel", undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  test("polls the notification summary when Broadcast is disabled", async () => {
    const { root } = createTestRenderer();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue(initialSnapshot),
    });

    await renderWithRoot(
      root,
      React.createElement(NotificationLiveUpdates, {
        initialSnapshot,
        pollIntervalMs: 50,
      })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/account/notifications/summary",
      {
        cache: "no-store",
        signal: expect.any(AbortSignal),
      }
    );

    await act(async () => {
      root.unmount();
    });
  });

  test("publishes polling snapshots to browser subscribers", async () => {
    const { root } = createTestRenderer();
    const listener = vi.fn();
    window.addEventListener(NOTIFICATION_REALTIME_EVENT, listener);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        version: "2026-06-04T10:01:00.000Z",
        unreadCount: 1,
        latestUnreadNotification: { title: "Assigned: Ship realtime" },
        serverTime: "2026-06-04T10:01:00.000Z",
      }),
    });

    await renderWithRoot(
      root,
      React.createElement(NotificationLiveUpdates, {
        initialSnapshot,
        pollIntervalMs: 50,
      })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });

    expect(listener).toHaveBeenCalled();

    window.removeEventListener(NOTIFICATION_REALTIME_EVENT, listener);
    await act(async () => {
      root.unmount();
    });
  });

  test("ignores a stale reconciliation response but accepts same-version changes", async () => {
    const { root } = createTestRenderer();
    const listener = vi.fn();
    window.addEventListener(NOTIFICATION_REALTIME_EVENT, listener);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        version: "2026-06-04T10:02:00.000Z", unreadCount: 2,
        latestUnreadNotification: { title: "New" }, serverTime: "2026-06-04T10:02:00.000Z",
      }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        version: "2026-06-04T10:01:00.000Z", unreadCount: 1,
        latestUnreadNotification: { title: "Stale" }, serverTime: "2026-06-04T10:01:00.000Z",
      }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        version: "2026-06-04T10:02:00.000Z", unreadCount: 0,
        latestUnreadNotification: null, serverTime: "2026-06-04T10:02:01.000Z",
      }),
    });
    await renderWithRoot(root, React.createElement(NotificationLiveUpdates, {
      initialSnapshot,
      pollIntervalMs: 50,
    }));
    listener.mockClear();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(listener).toHaveBeenCalledTimes(1);
    expect((listener.mock.calls[0][0] as CustomEvent).detail.snapshot.unreadCount).toBe(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(listener).toHaveBeenCalledTimes(2);
    expect((listener.mock.calls[1][0] as CustomEvent).detail.snapshot.unreadCount).toBe(0);
    window.removeEventListener(NOTIFICATION_REALTIME_EVENT, listener);
    await act(async () => root.unmount());
  });

  test("uses the bounded visible default cadence while polling", async () => {
    const { root } = createTestRenderer();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue(initialSnapshot),
    });

    await renderWithRoot(
      root,
      React.createElement(NotificationLiveUpdates, {
        initialSnapshot,
      })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(19999);
    });

    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
    });
  });

  test("pauses notification checks while the document is hidden and resumes on visibility", async () => {
    const hiddenSpy = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    const { root } = createTestRenderer();
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(initialSnapshot),
    });

    await renderWithRoot(
      root,
      React.createElement(NotificationLiveUpdates, {
        initialSnapshot,
        pollIntervalMs: 50,
      })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(fetchMock).not.toHaveBeenCalled();

    hiddenSpy.mockReturnValue(false);

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    hiddenSpy.mockReturnValue(true);

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    hiddenSpy.mockReturnValue(false);

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      root.unmount();
    });
  });

  test("backs off repeated notification-check failures instead of retrying tightly", async () => {
    const { root } = createTestRenderer();
    fetchMock.mockResolvedValue({ ok: false, json: vi.fn() });

    await renderWithRoot(
      root,
      React.createElement(NotificationLiveUpdates, {
        initialSnapshot,
        pollIntervalMs: 50,
      })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(99);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue(initialSnapshot),
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);

    await act(async () => {
      root.unmount();
    });
  });

  test("escalates the failure backoff when the payload cannot be parsed", async () => {
    const { root } = createTestRenderer();
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockRejectedValue(new Error("invalid payload")),
    });

    await renderWithRoot(
      root,
      React.createElement(NotificationLiveUpdates, {
        initialSnapshot,
        pollIntervalMs: 50,
      })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);

    await act(async () => {
      root.unmount();
    });
  });

  test("does not fire the queued immediate check while the document is hidden", async () => {
    const hiddenSpy = vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    const { root } = createTestRenderer();

    let resolveFetch: ((value: unknown) => void) | null = null;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    );

    await renderWithRoot(
      root,
      React.createElement(NotificationLiveUpdates, {
        initialSnapshot,
        pollIntervalMs: 50,
      })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });

    hiddenSpy.mockReturnValue(true);
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await act(async () => {
      resolveFetch?.({
        ok: true,
        json: vi.fn().mockResolvedValue({
          version: "2026-06-04T10:01:00.000Z",
          unreadCount: 1,
          latestUnreadNotification: { title: "Assigned: Ship realtime" },
          serverTime: "2026-06-04T10:01:00.000Z",
        }),
      });
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    hiddenSpy.mockReturnValue(false);
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      root.unmount();
    });
  });

  test("coordinates polling across tabs so only one tab checks notifications", async () => {
    vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);
    MockBroadcastChannel.reset();
    stubJitterSequence([1, 0]);

    const tabA = createTestRenderer();
    const tabB = createTestRenderer();
    const updatedSnapshot = {
      version: "2026-06-04T10:01:00.000Z",
      unreadCount: 1,
      latestUnreadNotification: { title: "Assigned: Ship realtime" },
      serverTime: "2026-06-04T10:01:00.000Z",
    };
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(updatedSnapshot),
    });
    const listener = vi.fn();
    window.addEventListener(NOTIFICATION_REALTIME_EVENT, listener);

    await renderWithRoot(
      tabA.root,
      React.createElement(NotificationLiveUpdates, {
        initialSnapshot,
        pollIntervalMs: 50,
      })
    );
    await renderWithRoot(
      tabB.root,
      React.createElement(NotificationLiveUpdates, {
        initialSnapshot,
        pollIntervalMs: 50,
      })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    const settledCalls = fetchMock.mock.calls.length;
    expect(settledCalls).toBeGreaterThan(0);

    const sharedSnapshotEvents = listener.mock.calls.filter(
      ([event]) =>
        (event as CustomEvent<{ snapshot: { version: string } }>).detail
          ?.snapshot?.version === updatedSnapshot.version
    );
    // twice per snapshot: the leader applies it locally, the follower applies the broadcast
    expect(sharedSnapshotEvents).toHaveLength(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    const coordinatedCalls = fetchMock.mock.calls.length - settledCalls;
    expect(coordinatedCalls).toBeGreaterThanOrEqual(9);
    expect(coordinatedCalls).toBeLessThanOrEqual(11);

    window.removeEventListener(NOTIFICATION_REALTIME_EVENT, listener);
    await act(async () => {
      tabB.root.unmount();
    });
    await act(async () => {
      tabA.root.unmount();
    });
  });

  test("keeps checking notifications when the current leader tab closes", async () => {
    vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);
    MockBroadcastChannel.reset();
    stubJitterSequence([1, 0, 0]);

    const tabA = createTestRenderer();
    const tabB = createTestRenderer();
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(initialSnapshot),
    });

    await renderWithRoot(
      tabA.root,
      React.createElement(NotificationLiveUpdates, {
        initialSnapshot,
        pollIntervalMs: 50,
      })
    );
    await renderWithRoot(
      tabB.root,
      React.createElement(NotificationLiveUpdates, {
        initialSnapshot,
        pollIntervalMs: 50,
      })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    await act(async () => {
      tabB.root.unmount();
    });

    const beforeTakeover = fetchMock.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    const takeoverCalls = fetchMock.mock.calls.length - beforeTakeover;
    expect(takeoverCalls).toBeGreaterThanOrEqual(15);

    await act(async () => {
      tabA.root.unmount();
    });
  });

  test("pauses both tabs while hidden and resumes a single checker", async () => {
    vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);
    MockBroadcastChannel.reset();
    stubJitterSequence([1, 0, 1, 0]);

    const tabA = createTestRenderer();
    const tabB = createTestRenderer();
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(initialSnapshot),
    });

    await renderWithRoot(
      tabA.root,
      React.createElement(NotificationLiveUpdates, {
        initialSnapshot,
        pollIntervalMs: 50,
      })
    );
    await renderWithRoot(
      tabB.root,
      React.createElement(NotificationLiveUpdates, {
        initialSnapshot,
        pollIntervalMs: 50,
      })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    const hiddenSpy = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(3000);
    });

    const pollsWhileHidden = fetchMock.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(fetchMock.mock.calls.length).toBe(pollsWhileHidden);

    hiddenSpy.mockReturnValue(false);
    const beforeResume = fetchMock.mock.calls.length;
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(2000);
    });

    const resumedCalls = fetchMock.mock.calls.length - beforeResume;
    expect(resumedCalls).toBeGreaterThanOrEqual(25);
    expect(resumedCalls).toBeLessThanOrEqual(45);

    await act(async () => {
      tabB.root.unmount();
    });
    await act(async () => {
      tabA.root.unmount();
    });
  });

  test("stays silent on the bus when mounted in an already-hidden document", async () => {
    vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);
    MockBroadcastChannel.reset();
    const observer = new MockBroadcastChannel(
      "nexusdash-tab-leader:notifications"
    );
    const heardKinds: string[] = [];
    observer.addEventListener("message", (event) => {
      heardKinds.push(
        ((event.data as { kind?: string }).kind ?? "unknown") as string
      );
    });

    const hiddenSpy = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    const { root } = createTestRenderer();
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(initialSnapshot),
    });

    await renderWithRoot(
      root,
      React.createElement(NotificationLiveUpdates, {
        initialSnapshot,
        pollIntervalMs: 50,
      })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(heardKinds).toEqual([]);

    await act(async () => {
      root.unmount();
    });
  });
});
