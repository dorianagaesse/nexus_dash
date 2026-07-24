// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { publishNotificationRealtimeSnapshot } from "@/lib/notification-realtime-client";

let mockPathname = "/account";
let mockSearchParams = new URLSearchParams(
  "returnTo=%2Fprojects%2Fproject-1%3FtaskId%3Dtask-7%23kanban"
);

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useSearchParams: () => mockSearchParams,
}));

import { UserHubShell } from "@/components/account/user-hub-shell";

(globalThis as { React?: typeof React }).React = React;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const initialSnapshot = {
  version: "2026-07-21T08:00:00.000Z",
  unreadCount: 3,
  latestUnreadNotification: { title: "Assigned: Hub navigation" },
  serverTime: "2026-07-21T08:00:00.000Z",
};

function renderHub() {
  return renderToStaticMarkup(
    <UserHubShell
      displayName="Dorian"
      usernameTag="dorian#3240"
      avatarSeed="hub-seed"
      initialNotificationSnapshot={initialSnapshot}
    >
      <div>Current view</div>
    </UserHubShell>
  );
}

describe("user hub shell", () => {
  beforeEach(() => {
    mockPathname = "/account";
    mockSearchParams = new URLSearchParams(
      "returnTo=%2Fprojects%2Fproject-1%3FtaskId%3Dtask-7%23kanban"
    );
  });

  test("renders three route-backed destinations with one semantic current view", () => {
    const result = renderHub();

    expect(result).toContain('aria-label="User hub navigation"');
    expect(result.match(/aria-current="page"/g)).toHaveLength(1);
    expect(result).toContain(">Account<");
    expect(result).toContain(">Settings<");
    expect(result).toContain(">Notifications<");
    expect(result).toContain("3 unread notifications");
    expect(result).toContain(
      "/account/settings?returnTo=%2Fprojects%2Fproject-1%3FtaskId%3Dtask-7%23kanban"
    );
    expect(result).toContain("min-h-14");
  });

  test("keeps Settings current on its nested developer route", () => {
    mockPathname = "/account/settings/developers";
    const result = renderHub();
    const container = document.createElement("div");
    container.innerHTML = result;
    const settingsLink = Array.from(container.querySelectorAll("a")).find(
      (link) => link.textContent?.trim() === "Settings"
    );

    expect(settingsLink?.getAttribute("aria-current")).toBe("page");
  });

  test("uses a safe project fallback for an unsafe contextual URL", () => {
    mockPathname = "/account/notifications";
    mockSearchParams = new URLSearchParams(
      "returnTo=https%3A%2F%2Fevil.example%2Fphish"
    );

    const result = renderHub();

    expect(result).toContain('href="/projects"');
    expect(result).not.toContain("evil.example");
  });

  test("updates the Notifications badge from the shared live snapshot", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <UserHubShell
          displayName="Dorian"
          usernameTag="dorian#3240"
          avatarSeed="hub-seed"
          initialNotificationSnapshot={initialSnapshot}
        >
          <div>Current view</div>
        </UserHubShell>
      );
    });

    await act(async () => {
      publishNotificationRealtimeSnapshot({
        ...initialSnapshot,
        version: "2026-07-21T08:01:00.000Z",
        unreadCount: 12,
      });
    });

    expect(container.textContent).toContain("12");

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
