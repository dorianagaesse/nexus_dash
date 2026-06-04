// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { NotificationLiveUpdates } from "@/components/notification-live-updates";
import {
  NOTIFICATION_REALTIME_EVENT,
} from "@/lib/notification-realtime-client";

const fetchMock = vi.hoisted(() => vi.fn());

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class MockEventSource {
  static instances: MockEventSource[] = [];

  readonly url: string;
  closed = false;
  private listeners = new Map<string, Set<EventListener>>();

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: EventListener) {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListener) {
    this.listeners.get(type)?.delete(listener);
  }

  close() {
    this.closed = true;
  }

  emit(type: string, event: Event) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }

  open() {
    this.emit("open", new Event("open"));
  }

  error() {
    this.emit("error", new Event("error"));
  }

  notificationSnapshot(payload: unknown) {
    this.emit(
      "notification-snapshot",
      new MessageEvent("notification-snapshot", {
        data: JSON.stringify(payload),
      }) as unknown as Event
    );
  }
}

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
    MockEventSource.instances = [];
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  test("uses the notification stream when EventSource is available", async () => {
    vi.stubGlobal("EventSource", MockEventSource);
    const { root } = createTestRenderer();

    await renderWithRoot(
      root,
      React.createElement(NotificationLiveUpdates, {
        initialSnapshot,
        pollIntervalMs: 50,
      })
    );

    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0]?.url).toBe(
      "/api/account/notifications/stream"
    );

    await act(async () => {
      MockEventSource.instances[0]?.open();
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });

    expect(MockEventSource.instances[0]?.closed).toBe(true);
  });

  test("publishes stream snapshots to browser subscribers", async () => {
    vi.stubGlobal("EventSource", MockEventSource);
    const { root } = createTestRenderer();
    const listener = vi.fn();
    window.addEventListener(NOTIFICATION_REALTIME_EVENT, listener);

    await renderWithRoot(
      root,
      React.createElement(NotificationLiveUpdates, {
        initialSnapshot,
        pollIntervalMs: 50,
      })
    );

    await act(async () => {
      MockEventSource.instances[0]?.open();
      MockEventSource.instances[0]?.notificationSnapshot({
        version: "2026-06-04T10:01:00.000Z",
        unreadCount: 1,
        latestUnreadNotification: { title: "Assigned: Ship realtime" },
        serverTime: "2026-06-04T10:01:00.000Z",
      });
    });

    expect(listener).toHaveBeenCalled();

    window.removeEventListener(NOTIFICATION_REALTIME_EVENT, listener);
    await act(async () => {
      root.unmount();
    });
  });

  test("falls back to polling when the stream fails before opening", async () => {
    vi.stubGlobal("EventSource", MockEventSource);
    const { root } = createTestRenderer();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        version: "2026-06-04T10:02:00.000Z",
        unreadCount: 2,
        latestUnreadNotification: { title: "Project invitation: Alpha" },
        serverTime: "2026-06-04T10:02:00.000Z",
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
      MockEventSource.instances[0]?.error();
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });

    expect(MockEventSource.instances[0]?.closed).toBe(true);
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
});
