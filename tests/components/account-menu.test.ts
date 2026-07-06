// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { publishNotificationRealtimeSnapshot } from "@/lib/notification-realtime-client";

vi.mock("@/lib/hooks/use-dismissible-menu", () => ({
  useDismissibleMenu: vi.fn(() => ({ current: null })),
}));

import { AccountMenu } from "@/components/account-menu";

(globalThis as { React?: typeof React }).React = React;

describe("account-menu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns null when user is not authenticated", () => {
    const result = renderToStaticMarkup(
      React.createElement(AccountMenu, {
        isAuthenticated: false,
        displayName: null,
        usernameTag: null,
        avatarSeed: null,
        initialUnreadNotificationCount: 0,
      })
    );

    expect(result).toBe("");
  });

  test("renders account menu trigger when user is authenticated", () => {
    const result = renderToStaticMarkup(
      React.createElement(AccountMenu, {
        isAuthenticated: true,
        displayName: "test.user",
        usernameTag: "test.user#1234",
        avatarSeed: "seed-123",
        initialUnreadNotificationCount: 0,
      })
    );

    expect(result).toContain("aria-label=\"Account menu\"");
    expect(result).toContain("aria-expanded=\"false\"");
    expect(result).toContain("data:image/svg+xml");
    expect(result).toContain("alt=\"\"");
  });

  test("renders notification indicator when unread notifications exist", () => {
    const result = renderToStaticMarkup(
      React.createElement(AccountMenu, {
        isAuthenticated: true,
        displayName: "test.user",
        usernameTag: "test.user#1234",
        avatarSeed: "seed-123",
        initialUnreadNotificationCount: 3,
      })
    );

    expect(result).toContain("bg-red-500");
  });

  test("updates the notification indicator from live snapshots", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(AccountMenu, {
          isAuthenticated: true,
          displayName: "test.user",
          usernameTag: "test.user#1234",
          avatarSeed: "seed-123",
          initialUnreadNotificationCount: 0,
        })
      );
    });

    expect(container.textContent).not.toContain("Notifications");
    expect(container.querySelector(".bg-red-500")).toBeNull();

    await act(async () => {
      publishNotificationRealtimeSnapshot({
        version: "2026-06-04T10:00:00.000Z",
        unreadCount: 2,
        latestUnreadNotification: { title: "Assigned: Ship realtime" },
        serverTime: "2026-06-04T10:00:00.000Z",
      });
    });

    expect(container.querySelector(".bg-red-500")).not.toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  test("keeps version and repository diagnostics inside the account utility", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(AccountMenu, {
          isAuthenticated: true,
          displayName: "test.user",
          usernameTag: "test.user#1234",
          avatarSeed: "seed-123",
          initialUnreadNotificationCount: 0,
          appMetadata: {
            repositoryUrl: "https://github.com/example/nexusdash",
            versionTag: "v0.25.0",
            versionLabel: "v0.25.0",
            revision: "abc1234",
            revisionLabel: "build abc1234",
            environment: "test",
            diagnosticLabel: "v0.25.0 | test | build abc1234",
          },
        })
      );
    });

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('button[aria-label="Account menu"]')
        ?.click();
    });

    expect(container.textContent).toContain("v0.25.0");
    expect(container.textContent).toContain("Repository");
    expect(container.querySelector("[aria-expanded='true']")).not.toBeNull();

    await act(async () => {
      root.unmount();
    });
  });
});
