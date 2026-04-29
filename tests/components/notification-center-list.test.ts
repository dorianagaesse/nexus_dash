import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { NotificationCenterList } from "@/components/account/notification-center-list";

(globalThis as { React?: typeof React }).React = React;

const noopAction = () => {};

describe("notification-center-list", () => {
  test("renders an empty notification inbox", () => {
    const result = renderToStaticMarkup(
      React.createElement(NotificationCenterList, {
        notifications: [],
        onMarkRead: noopAction,
        onMarkUnread: noopAction,
        onMarkAllRead: noopAction,
        onAcceptInvitation: noopAction,
        onDeclineInvitation: noopAction,
      })
    );

    expect(result).toContain("No active notifications.");
    expect(result).toContain("All visible notifications are read.");
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
        onMarkRead: noopAction,
        onMarkUnread: noopAction,
        onMarkAllRead: noopAction,
        onAcceptInvitation: noopAction,
        onDeclineInvitation: noopAction,
      })
    );

    expect(result).toContain("1 unread notification");
    expect(result).toContain("Project invitation: Shared Project");
    expect(result).toContain("owner#4321");
    expect(result).toContain("Accept");
    expect(result).toContain("Decline");
    expect(result).toContain("Mark read");
  });
});
