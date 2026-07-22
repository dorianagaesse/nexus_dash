// @vitest-environment jsdom

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

let mockPathname = "/account/notifications";
let mockSearchParams = new URLSearchParams(
  "returnTo=%2Fprojects%2Fproject-1%3FtaskId%3Dtask-7"
);

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useSearchParams: () => mockSearchParams,
}));

vi.mock("@/lib/hooks/use-dismissible-menu", () => ({
  useDismissibleMenu: () => ({ current: null }),
}));

import { AuthenticatedAppShellClient } from "@/components/authenticated-app-shell-client";

(globalThis as { React?: typeof React }).React = React;

const notificationSnapshot = {
  version: "2026-07-06T08:00:00.000Z",
  unreadCount: 2,
  latestUnreadNotification: { title: "Assigned: Shell work" },
  serverTime: "2026-07-06T08:00:00.000Z",
};

describe("authenticated app shell", () => {
  test("renders labeled primary destinations with semantic current state", () => {
    mockPathname = "/account/notifications";
    mockSearchParams = new URLSearchParams(
      "returnTo=%2Fprojects%2Fproject-1%3FtaskId%3Dtask-7"
    );
    const result = renderToStaticMarkup(
      <AuthenticatedAppShellClient
        displayName="Dorian"
        usernameTag="dorian#1234"
        avatarSeed="seed"
        initialNotificationSnapshot={notificationSnapshot}
        notificationBanner={<div>Notification banner</div>}
      >
        <main>Settings content</main>
      </AuthenticatedAppShellClient>
    );

    expect(result).toContain('aria-label="Primary navigation"');
    expect(result).toContain("Projects");
    expect(result).toContain("Inbox");
    expect(result).toContain("Account menu");
    expect(result).toContain("Appearance");
    expect(result).toContain('aria-current="page"');
    expect(result).toContain("lg:pl-64");
    expect(result).toContain("z-[var(--layer-shell)]");
    expect(result).toContain("Skip to main content");
    expect(result).toContain(
      "/account/notifications?returnTo=%2Fprojects%2Fproject-1%3FtaskId%3Dtask-7"
    );
  });

  test("adapts desktop navigation to a specific project", () => {
    mockPathname = "/projects/project-1";
    mockSearchParams = new URLSearchParams();

    const result = renderToStaticMarkup(
      <AuthenticatedAppShellClient
        displayName="Dorian"
        usernameTag="dorian#1234"
        avatarSeed="seed"
        initialNotificationSnapshot={notificationSnapshot}
        notificationBanner={<div>Notification banner</div>}
      >
        <main>Project content</main>
      </AuthenticatedAppShellClient>
    );

    expect(result).toContain("All projects");
    expect(result).toContain("Current project");
    expect(result).toContain("Overview");
    expect(result).toContain('href="/projects/project-1"');
    expect(result).toContain('id="project-sidebar-actions"');
  });
});
