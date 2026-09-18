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

const appMetadataProps = {
  appVersionLabel: "v1.2.3",
  appEnvironment: "production" as const,
  appDiagnosticLabel: "v1.2.3 | production | build abc1234",
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
          {...appMetadataProps}
          notificationBanner={<div>Notification banner</div>}
        >
          <main>Settings content</main>
        </AuthenticatedAppShellClient>
      </ToastProvider>
    );

    expect(result).toContain('aria-label="Primary navigation"');
    expect(result).toContain("Projects");
    expect(result).toContain("Inbox");
    expect(result).not.toContain("Todos");
    expect(result).toContain('aria-label="Workspace navigation"');
    expect(result).not.toContain('aria-label="Project navigation"');
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
    expect(result).toContain("v1.2.3");
    expect(result).not.toContain("Project workspace");
    expect(result).toContain(
      "/account/notifications?returnTo=%2Fprojects%2Fproject-1%3FtaskId%3Dtask-7"
    );
  });

  test("appends the environment label under the brand outside production", () => {
    mockPathname = "/projects";
    mockSearchParams = new URLSearchParams();

    const previewResult = renderToStaticMarkup(
      <ToastProvider>
        <AuthenticatedAppShellClient
          displayName="Dorian"
          usernameTag="dorian#1234"
          avatarSeed="seed"
          initialNotificationSnapshot={notificationSnapshot}
          {...appMetadataProps}
          appEnvironment="preview"
          appDiagnosticLabel="v1.2.3 | preview | build abc1234"
          notificationBanner={<div>Notification banner</div>}
        >
          <main>Project content</main>
        </AuthenticatedAppShellClient>
      </ToastProvider>
    );

    expect(previewResult).toContain("v1.2.3");
    expect(previewResult).toContain("· Preview");
    expect(previewResult).toContain('title="v1.2.3 | preview | build abc1234"');
    expect(previewResult).not.toContain("Project workspace");

    const productionResult = renderToStaticMarkup(
      <ToastProvider>
        <AuthenticatedAppShellClient
          displayName="Dorian"
          usernameTag="dorian#1234"
          avatarSeed="seed"
          initialNotificationSnapshot={notificationSnapshot}
          {...appMetadataProps}
          notificationBanner={<div>Notification banner</div>}
        >
          <main>Project content</main>
        </AuthenticatedAppShellClient>
      </ToastProvider>
    );

    expect(productionResult).toContain("v1.2.3");
    expect(productionResult).not.toContain("· Preview");
    expect(productionResult).not.toContain("· Development");
    expect(productionResult).not.toContain("Project workspace");
  });

  test("adapts desktop navigation to a specific project", () => {
    mockPathname = "/projects/project-1/todos";
    mockSearchParams = new URLSearchParams();

    const result = renderToStaticMarkup(
      <ToastProvider>
        <AuthenticatedAppShellClient
          displayName="Dorian"
          usernameTag="dorian#1234"
          avatarSeed="seed"
          initialNotificationSnapshot={notificationSnapshot}
          {...appMetadataProps}
          notificationBanner={<div>Notification banner</div>}
        >
          <main>Project content</main>
        </AuthenticatedAppShellClient>
      </ToastProvider>
    );

    expect(result).toContain("All projects");
    expect(result).toContain("Current project");
    expect(result).toContain("Overview");
    expect(result).toContain("Todos");
    expect(result).toContain('href="/projects/project-1"');
    expect(result).toContain('href="/projects/project-1/todos"');
    expect(result).toContain('aria-label="Workspace navigation"');
    expect(result).toContain('aria-label="Project navigation"');
    expect(result).toContain("overflow-x-auto");
    expect(result).toContain("overscroll-x-contain");
    expect(result).toContain('id="project-sidebar-actions"');
  });
});
