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
import { ToastProvider } from "@/components/toast-provider";

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
      <ToastProvider>
        <AuthenticatedAppShellClient
          displayName="Dorian"
          usernameTag="dorian#1234"
          avatarSeed="seed"
          initialNotificationSnapshot={notificationSnapshot}
          initialMeetingTodoSummary={{ openCount: 3, overdueCount: 1 }}
          notificationBanner={<div>Notification banner</div>}
        >
          <main>Settings content</main>
        </AuthenticatedAppShellClient>
      </ToastProvider>
    );

    expect(result).toContain('aria-label="Primary navigation"');
    expect(result).toContain("Projects");
    expect(result).toContain("Todos");
    expect(result).toContain("Inbox");
    expect(result).toContain("3 open todos, 1 overdue");
    expect(result).toContain("Account menu");
    expect(result).toContain("data-account-identity-area");
    expect(result).toContain('aria-current="page"');
    expect(result).toContain("lg:pl-64");
    expect(result).toContain("z-[var(--layer-shell)]");
    expect(result).toContain("Skip to main content");
    expect(result).toContain("Report a bug or feedback");
    expect(result).toContain('title="Report a bug or feedback"');
    expect(result).not.toContain(">Feedback</span>");
    expect(result.match(/data-product-state="alpha"/g)).toHaveLength(2);
    expect(
      result.match(/aria-label="NexusDash alpha — projects"/g)
    ).toHaveLength(2);
    expect(result).toContain(
      "/account/notifications?returnTo=%2Fprojects%2Fproject-1%3FtaskId%3Dtask-7"
    );
  });

  test("adapts desktop navigation to a specific project", () => {
    mockPathname = "/projects/project-1";
    mockSearchParams = new URLSearchParams();

    const result = renderToStaticMarkup(
      <ToastProvider>
        <AuthenticatedAppShellClient
          displayName="Dorian"
          usernameTag="dorian#1234"
          avatarSeed="seed"
          initialNotificationSnapshot={notificationSnapshot}
          initialMeetingTodoSummary={{ openCount: 3, overdueCount: 1 }}
          notificationBanner={<div>Notification banner</div>}
        >
          <main>Project content</main>
        </AuthenticatedAppShellClient>
      </ToastProvider>
    );

    expect(result).toContain("All projects");
    expect(result).toContain("Current project");
    expect(result).toContain("Overview");
    expect(result).toContain('href="/projects/project-1"');
    expect(result).toContain('id="project-sidebar-actions"');
  });
});
