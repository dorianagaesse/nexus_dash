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

describe("notification Broadcast fallback", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    broadcast.start.mockReset();
    document.body.innerHTML = "";
  });

  test("falls back to polling after Broadcast fails", async () => {
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
        userId="user-1" broadcastEnabled pollIntervalMs={10_000}
      />);
    });
    expect(broadcast.start).toHaveBeenCalledOnce();
    await act(async () => {
      broadcast.start.mock.calls[0][0].onFailure();
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
