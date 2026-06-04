// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { NotificationCenterList } from "@/components/account/notification-center-list";
import { publishNotificationRealtimeSnapshot } from "@/lib/notification-realtime-client";

(globalThis as { React?: typeof React }).React = React;

const noopAction = () => {};
const fetchMock = vi.hoisted(() => vi.fn());
const initialSnapshot = {
  version: "2026-06-04T10:00:00.000Z",
  unreadCount: 0,
  latestUnreadNotification: null,
  serverTime: "2026-06-04T10:00:00.000Z",
};

describe("notification-center-list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  test("renders an empty notification inbox", () => {
    const result = renderToStaticMarkup(
      React.createElement(NotificationCenterList, {
        notifications: [],
        initialSnapshot,
        onMarkRead: noopAction,
        onMarkUnread: noopAction,
        onMarkAllRead: noopAction,
        onAcceptInvitation: noopAction,
        onDeclineInvitation: noopAction,
      })
    );

    expect(result).toContain("No active notifications.");
    expect(result).toContain("All read");
  });

  test("renders an actionable project invitation notification", () => {
    const result = renderToStaticMarkup(
      React.createElement(NotificationCenterList, {
        notifications: [
          {
            id: "notification-1",
            type: "project_invitation",
            title: "Project invitation: Shared Project",
            body: "owner#4321 invited you to collaborate on Shared Project.",
            targetPath: "/invite/project/invite-1",
            sourceType: "project_invitation",
            sourceId: "invite-1",
            metadata: {
              invitationId: "invite-1",
              projectId: "project-1",
              projectName: "Shared Project",
              invitedEmail: "invitee@example.com",
              invitedByDisplayName: "owner#4321",
              invitedByEmail: "owner@example.com",
              role: "editor",
              expiresAt: "2026-05-13T08:00:00.000Z",
              inviteLinkPath: "/invite/project/invite-1",
            },
            readAt: null,
            resolvedAt: null,
            createdAt: "2026-04-29T08:00:00.000Z",
            updatedAt: "2026-04-29T08:01:00.000Z",
          },
        ],
        initialSnapshot: {
          ...initialSnapshot,
          unreadCount: 1,
          latestUnreadNotification: {
            title: "Project invitation: Shared Project",
          },
        },
        onMarkRead: noopAction,
        onMarkUnread: noopAction,
        onMarkAllRead: noopAction,
        onAcceptInvitation: noopAction,
        onDeclineInvitation: noopAction,
      })
    );

    expect(result).toContain("1 unread");
    expect(result).toContain("Project invitation: Shared Project");
    expect(result).toContain("owner#4321");
    expect(result).toContain("Accept");
    expect(result).toContain("Decline");
    expect(result).toContain("Mark read");
  });

  test("refreshes visible rows when a live snapshot changes", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        notifications: [
          {
            id: "notification-2",
            type: "task_assignment",
            title: "Assigned: Ship realtime",
            body: "Dorian assigned you to Ship realtime.",
            targetPath: "/projects/project-1?taskId=task-2",
            sourceType: "task_assignment",
            sourceId: "task-2",
            metadata: null,
            readAt: null,
            resolvedAt: null,
            createdAt: "2026-06-04T10:01:00.000Z",
            updatedAt: "2026-06-04T10:01:00.000Z",
          },
        ],
      }),
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(NotificationCenterList, {
          notifications: [],
          initialSnapshot,
          onMarkRead: noopAction,
          onMarkUnread: noopAction,
          onMarkAllRead: noopAction,
          onAcceptInvitation: noopAction,
          onDeclineInvitation: noopAction,
        })
      );
    });

    expect(container.textContent).toContain("No active notifications.");

    await act(async () => {
      publishNotificationRealtimeSnapshot({
        version: "2026-06-04T10:01:00.000Z",
        unreadCount: 1,
        latestUnreadNotification: { title: "Assigned: Ship realtime" },
        serverTime: "2026-06-04T10:01:00.000Z",
      });
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/account/notifications", {
      cache: "no-store",
      signal: expect.any(AbortSignal),
    });
    expect(container.textContent).toContain("Assigned: Ship realtime");

    await act(async () => {
      root.unmount();
    });
  });
});
