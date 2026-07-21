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
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

    expect(result).toContain("bg-destructive");
    expect(result).toContain("3 unread notifications");
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
    expect(container.querySelector(".bg-destructive")).toBeNull();

    await act(async () => {
      publishNotificationRealtimeSnapshot({
        version: "2026-06-04T10:00:00.000Z",
        unreadCount: 2,
        latestUnreadNotification: { title: "Assigned: Ship realtime" },
        serverTime: "2026-06-04T10:00:00.000Z",
      });
    });

    expect(container.querySelector(".bg-destructive")).not.toBeNull();

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
        .querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')
        ?.click();
    });

    expect(container.textContent).toContain("v0.25.0");
    expect(container.textContent).toContain("Repository");
    expect(container.querySelector("[aria-expanded='true']")).not.toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  test("uses one user-hub launcher and separates secondary utilities from logout", async () => {
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
          initialUnreadNotificationCount: 4,
          currentPath: "/projects/project-1?taskId=task-7#kanban",
          appMetadata: {
            repositoryUrl: "https://github.com/example/nexusdash",
            versionTag: "v0.27.0",
            versionLabel: "v0.27.0",
            revision: "abc1234",
            revisionLabel: "build abc1234",
            environment: "test",
            diagnosticLabel: "v0.27.0 | test | build abc1234",
          },
        })
      );
    });

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')
        ?.click();
    });

    const menuLinks = Array.from(
      container.querySelectorAll<HTMLAnchorElement>('a[role="menuitem"]')
    );
    expect(menuLinks).toHaveLength(2);
    expect(menuLinks[0]?.textContent).toContain("Your account");
    expect(menuLinks[0]?.getAttribute("href")).toBe(
      "/account?returnTo=%2Fprojects%2Fproject-1%3FtaskId%3Dtask-7%23kanban"
    );
    expect(container.querySelector('[role="menuitem"][aria-label^="Switch to"]')).not.toBeNull();
    const logout = Array.from(
      container.querySelectorAll<HTMLElement>('[role="menuitem"]')
    ).find((item) => item.textContent?.includes("Log out"));
    expect(logout?.closest("form")?.className).toContain("border-t");

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  test("supports an inward-opening sidebar menu", async () => {
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
          menuPlacement: "top",
          menuAlign: "start",
        })
      );
    });

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')
        ?.click();
    });

    const menu = container.querySelector<HTMLElement>('[role="menu"]');
    expect(menu?.classList.contains("bottom-full")).toBe(true);
    expect(menu?.classList.contains("left-0")).toBe(true);
    expect(menu?.classList.contains("right-0")).toBe(false);

    await act(async () => {
      root.unmount();
    });
  });

  test("supports arrow-key traversal and restores focus on Escape", async () => {
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

    const trigger = container.querySelector<HTMLButtonElement>(
      'button[aria-haspopup="menu"]'
    );
    trigger?.focus();
    await act(async () => {
      trigger?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })
      );
    });

    const items = Array.from(
      container.querySelectorAll<HTMLElement>('[role="menuitem"]')
    );
    expect(document.activeElement).toBe(items[0]);

    await act(async () => {
      items[0]?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })
      );
    });
    expect(document.activeElement).toBe(items[1]);

    await act(async () => {
      items[1]?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
    });
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
