// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { AccountNotificationsLink } from "@/components/account-notifications-link";
import { publishNotificationRealtimeSnapshot } from "@/lib/notification-realtime-client";

(globalThis as { React?: typeof React }).React = React;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const initialSnapshot = {
  version: "2026-06-04T10:00:00.000Z",
  unreadCount: 0,
  latestUnreadNotification: null,
  serverTime: "2026-06-04T10:00:00.000Z",
};

describe("AccountNotificationsLink", () => {
  test("renders the notifications link without a badge when all read", () => {
    const result = renderToStaticMarkup(
      React.createElement(AccountNotificationsLink, {
        initialSnapshot,
      })
    );

    expect(result).toContain("Notifications");
    expect(result).not.toContain("bg-red-500");
  });

  test("updates the badge from live snapshots", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(AccountNotificationsLink, {
          initialSnapshot,
        })
      );
    });

    expect(container.querySelector(".bg-red-500")).toBeNull();

    await act(async () => {
      publishNotificationRealtimeSnapshot({
        version: "2026-06-04T10:01:00.000Z",
        unreadCount: 12,
        latestUnreadNotification: { title: "Mentioned in: Task C" },
        serverTime: "2026-06-04T10:01:00.000Z",
      });
    });

    expect(container.textContent).toContain("9+");

    await act(async () => {
      root.unmount();
    });
  });
});
