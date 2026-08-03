// @vitest-environment jsdom

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

const todoSummaryMock = vi.hoisted(() => ({
  value: { activeCount: 0, hasOverdue: false } as {
    activeCount: number;
    hasOverdue: boolean;
  } | null,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/projects/project-1/todos",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/hooks/use-project-todo-summary", () => ({
  useProjectTodoSummary: () => todoSummaryMock.value,
}));

vi.mock("@/lib/hooks/use-dismissible-menu", () => ({
  useDismissibleMenu: () => ({ current: null }),
}));

import { AuthenticatedAppShellClient } from "@/components/authenticated-app-shell-client";
import { ToastProvider } from "@/components/toast-provider";

(globalThis as { React?: typeof React }).React = React;

const notificationSnapshot = {
  version: "2026-08-03T08:00:00.000Z",
  unreadCount: 2,
  latestUnreadNotification: { title: "Assigned: Shell work" },
  serverTime: "2026-08-03T08:00:00.000Z",
};

function renderShell() {
  return renderToStaticMarkup(
    <ToastProvider>
      <AuthenticatedAppShellClient
        displayName="Dorian"
        usernameTag="dorian#1234"
        avatarSeed="seed"
        initialNotificationSnapshot={notificationSnapshot}
        notificationBanner={<div>Notification banner</div>}
      >
        <main>Project content</main>
      </AuthenticatedAppShellClient>
    </ToastProvider>
  );
}

describe("authenticated shell todo badge", () => {
  beforeEach(() => {
    todoSummaryMock.value = { activeCount: 0, hasOverdue: false };
  });

  test("hides the todo badge at zero without affecting Inbox", () => {
    const result = renderShell();

    expect(result).not.toContain("active todos");
    expect(result).toContain("2 unread notifications");
  });

  test("shows a neutral exact active count", () => {
    todoSummaryMock.value = { activeCount: 128, hasOverdue: false };

    const result = renderShell();

    expect(result.match(/aria-label="Todos, 128 active todos"/g)).toHaveLength(
      2
    );
    expect(result).toContain("bg-foreground text-background");
    expect(result).not.toContain("overdue work present");
  });

  test("announces overdue work and renders the orange warning treatment", () => {
    todoSummaryMock.value = { activeCount: 1, hasOverdue: true };

    const result = renderShell();

    expect(
      result.match(/aria-label="Todos, 1 active todo, overdue work present"/g)
    ).toHaveLength(2);
    expect(result).toContain("bg-amber-400 text-amber-950");
  });
});
