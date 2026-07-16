// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { NotificationAwarenessBanner } from "@/components/notification-awareness-banner";
import { publishNotificationRealtimeSnapshot } from "@/lib/notification-realtime-client";

vi.mock("next/navigation", () => ({
  usePathname: () => "/projects/project-1",
  useSearchParams: () => new URLSearchParams("taskId=task-1"),
}));

(globalThis as { React?: typeof React }).React = React;

describe("notification-awareness-banner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("renders only the latest atomic notification instead of grouped unread text", async () => {
    const result = renderToStaticMarkup(
      React.createElement(NotificationAwarenessBanner, {
        initialSnapshot: {
          version: "2026-06-04T10:00:00.000Z",
          unreadCount: 1,
          latestUnreadNotification: {
            title: "Mentioned in: Task C",
          },
          serverTime: "2026-06-04T10:00:00.000Z",
        },
      })
    );

    expect(result).toContain("Mentioned in: Task C");
    expect(result).not.toContain("Mentioned in: Task B");
    expect(result).not.toContain("more unread notification");
    expect(result).toContain("Review notifications");
  });

  test("renders nothing when all notifications are already read", async () => {
    const result = renderToStaticMarkup(
      React.createElement(NotificationAwarenessBanner, {
        initialSnapshot: {
          version: "2026-06-04T10:00:00.000Z",
          unreadCount: 0,
          latestUnreadNotification: null,
          serverTime: "2026-06-04T10:00:00.000Z",
        },
      })
    );

    expect(result).toBe("");
  });

  test("appears when a live snapshot reports unread notifications", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(NotificationAwarenessBanner, {
          initialSnapshot: {
            version: "2026-06-04T10:00:00.000Z",
            unreadCount: 0,
            latestUnreadNotification: null,
            serverTime: "2026-06-04T10:00:00.000Z",
          },
        })
      );
    });

    expect(container.textContent).toBe("");

    await act(async () => {
      publishNotificationRealtimeSnapshot({
        version: "2026-06-04T10:01:00.000Z",
        unreadCount: 1,
        latestUnreadNotification: { title: "Project invitation: Alpha" },
        serverTime: "2026-06-04T10:01:00.000Z",
      });
    });

    expect(container.textContent).toContain("Project invitation: Alpha");

    await act(async () => {
      root.unmount();
    });
  });
});
