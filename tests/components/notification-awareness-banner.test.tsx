import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

const notificationServiceMock = vi.hoisted(() => ({
  listNotificationsForUser: vi.fn(),
}));

vi.mock("next/cache", () => ({
  unstable_noStore: vi.fn(),
}));

vi.mock("@/lib/observability/logger", () => ({
  logServerError: vi.fn(),
}));

vi.mock("@/lib/services/notification-service", () => ({
  listNotificationsForUser: notificationServiceMock.listNotificationsForUser,
}));

import { NotificationAwarenessBanner } from "@/components/notification-awareness-banner";

(globalThis as { React?: typeof React }).React = React;

describe("notification-awareness-banner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("renders only the latest atomic notification instead of grouped unread text", async () => {
    notificationServiceMock.listNotificationsForUser.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        notifications: [
          {
            id: "notification-latest",
            type: "task_comment_mention",
            title: "Mentioned in: Task C",
            body: "Agent mentioned you in a comment on Task C.",
            targetPath: "/projects/project-1?taskId=task-c",
            sourceType: "task_comment_mention",
            sourceId: "comment-c",
            metadata: null,
            readAt: null,
            resolvedAt: null,
            createdAt: "2026-05-16T00:20:00.000Z",
            updatedAt: "2026-05-16T00:20:00.000Z",
          },
          {
            id: "notification-older",
            type: "task_comment_mention",
            title: "Mentioned in: Task B",
            body: "Agent mentioned you in a comment on Task B.",
            targetPath: "/projects/project-1?taskId=task-b",
            sourceType: "task_comment_mention",
            sourceId: "comment-b",
            metadata: null,
            readAt: null,
            resolvedAt: null,
            createdAt: "2026-05-16T00:05:00.000Z",
            updatedAt: "2026-05-16T00:05:00.000Z",
          },
        ],
      },
    });

    const result = renderToStaticMarkup(
      await NotificationAwarenessBanner({ actorUserId: "user-1" })
    );

    expect(result).toContain("Mentioned in: Task C");
    expect(result).not.toContain("Mentioned in: Task B");
    expect(result).not.toContain("more unread notification");
    expect(result).toContain("Review notifications");
  });

  test("renders nothing when all notifications are already read", async () => {
    notificationServiceMock.listNotificationsForUser.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        notifications: [
          {
            id: "notification-read",
            type: "task_assignment",
            title: "Assigned: Task A",
            body: "Owner assigned you to Task A.",
            targetPath: "/projects/project-1?taskId=task-a",
            sourceType: "task_assignment",
            sourceId: "task-a",
            metadata: null,
            readAt: "2026-05-16T00:30:00.000Z",
            resolvedAt: null,
            createdAt: "2026-05-16T00:00:00.000Z",
            updatedAt: "2026-05-16T00:00:00.000Z",
          },
        ],
      },
    });

    const result = await NotificationAwarenessBanner({ actorUserId: "user-1" });

    expect(result).toBeNull();
  });
});
