// @vitest-environment jsdom

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/account/settings",
  useSearchParams: () =>
    new URLSearchParams("returnTo=%2Fprojects%2Fproject-1%3FtaskId%3Dtask-7"),
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
    const result = renderToStaticMarkup(
      <AuthenticatedAppShellClient
        displayName="Dorian"
        usernameTag="dorian#1234"
        avatarSeed="seed"
        initialNotificationSnapshot={notificationSnapshot}
        appMetadata={{
          repositoryUrl: "https://github.com/example/nexusdash",
          versionTag: "v0.25.0",
          versionLabel: "v0.25.0",
          revision: "abc1234",
          revisionLabel: "build abc1234",
          environment: "test",
          diagnosticLabel: "v0.25.0 | test | build abc1234",
        }}
        notificationBanner={<div>Notification banner</div>}
      >
        <main>Settings content</main>
      </AuthenticatedAppShellClient>
    );

    expect(result).toContain('aria-label="Primary navigation"');
    expect(result).toContain("Projects");
    expect(result).toContain("Notifications");
    expect(result).toContain("Account");
    expect(result).toContain("Settings");
    expect(result).toContain('aria-current="page"');
    expect(result).toContain("min-h-16");
    expect(result).toContain("z-[var(--layer-shell)]");
    expect(result).toContain("Skip to main content");
    expect(result).toContain(
      "/account/notifications?returnTo=%2Fprojects%2Fproject-1%3FtaskId%3Dtask-7"
    );
  });
});
