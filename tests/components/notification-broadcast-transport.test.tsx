// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";

const broadcast = vi.hoisted(() => ({ start: vi.fn() }));
vi.mock("@/lib/realtime/supabase-realtime-client", () => ({
  startBroadcastSubscription: broadcast.start,
}));

import { NotificationLiveUpdates } from "@/components/notification-live-updates";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class MockEventSource {
  static instances: MockEventSource[] = [];
  readonly url: string;
  private listeners = new Map<string, Set<EventListener>>();
  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }
  addEventListener(type: string, listener: EventListener) {
    const set = this.listeners.get(type) ?? new Set<EventListener>();
    set.add(listener);
    this.listeners.set(type, set);
  }
  removeEventListener(type: string, listener: EventListener) {
    this.listeners.get(type)?.delete(listener);
  }
  close() {}
  error() {
    for (const listener of this.listeners.get("error") ?? []) listener(new Event("error"));
  }
}

describe("notification Broadcast fallback", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    MockEventSource.instances = [];
    broadcast.start.mockReset();
    document.body.innerHTML = "";
  });

  test("uses Broadcast, then SSE, then polling after failures", async () => {
    vi.stubGlobal("EventSource", MockEventSource);
    vi.stubGlobal("BroadcastChannel", undefined);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: "2026-10-04T00:00:01.000Z",
        unreadCount: 1, latestUnreadNotification: { title: "Update" },
        serverTime: "2026-10-04T00:00:01.000Z" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    broadcast.start.mockReturnValue(() => undefined);
    const element = document.createElement("div");
    document.body.appendChild(element);
    const root = createRoot(element);
    await act(async () => {
      root.render(<NotificationLiveUpdates
        initialSnapshot={{ version: "2026-10-04T00:00:00.000Z",
          unreadCount: 0, latestUnreadNotification: null,
          serverTime: "2026-10-04T00:00:00.000Z" }}
        userId="user-1" broadcastEnabled streamEnabled pollIntervalMs={10_000}
      />);
    });
    expect(broadcast.start).toHaveBeenCalledOnce();
    expect(MockEventSource.instances).toHaveLength(0);
    await act(async () => {
      broadcast.start.mock.calls[0][0].onFailure();
    });
    expect(MockEventSource.instances[0].url).toBe("/api/account/notifications/stream");
    await act(async () => {
      MockEventSource.instances[0].error();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/account/notifications/summary", expect.any(Object)
    );
    await act(async () => root.unmount());
  });
});
