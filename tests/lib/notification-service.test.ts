import { beforeEach, describe, expect, test, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  notification: {
    count: vi.fn(),
    createMany: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
}));

const logServerErrorMock = vi.hoisted(() => vi.fn());
const enqueueEmailMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/observability/logger", () => ({
  logServerError: logServerErrorMock,
}));

vi.mock("@/lib/services/project-notification-email-service", () => ({
  enqueueNotificationEmailForNotification: enqueueEmailMock,
}));

import {
  countUnreadNotificationsForUser,
  createTaskDueDateReminderNotification,
  getLatestUnreadNotificationForUser,
  listNotificationsForUser,
  markAllNotificationsReadForUser,
  resolveProjectInvitationNotifications,
  setNotificationReadState,
} from "@/lib/services/notification-service";

describe("notification-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.notification.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.notification.createMany.mockResolvedValue({ count: 1 });
    prismaMock.notification.findFirst.mockResolvedValue(null);
    prismaMock.notification.findMany.mockResolvedValue([]);
    prismaMock.notification.count.mockResolvedValue(0);
    prismaMock.$queryRaw.mockResolvedValue([]);
  });

  test("syncs pending project invitations before listing active notifications", async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([
      {
        invitationId: "invite-1",
        projectId: "project-1",
        projectName: "Shared Project",
        invitedEmail: "invitee@example.com",
        invitedByEmail: "owner@example.com",
        invitedByName: "Owner",
        invitedByUsername: "owner",
        invitedByUsernameDiscriminator: "4321",
        invitationRole: "editor",
        createdAt: new Date("2026-04-29T08:00:00.000Z"),
        expiresAt: new Date("2026-05-13T08:00:00.000Z"),
      },
    ]);
    prismaMock.notification.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
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
          createdAt: new Date("2026-04-29T08:00:00.000Z"),
          updatedAt: new Date("2026-04-29T08:01:00.000Z"),
        },
      ]);

    const result = await listNotificationsForUser("user-1");

    expect(result).toEqual({
      ok: true,
      status: 200,
      data: {
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
      },
    });
    expect(prismaMock.notification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          recipientUserId: "user-1",
          sourceType: "project_invitation",
          sourceId: { notIn: ["invite-1"] },
        }),
      })
    );
    expect(prismaMock.notification.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skipDuplicates: true,
      })
    );
  });

  test("maps task due-date reminder notifications for the notification center", async () => {
    prismaMock.notification.findMany
      .mockResolvedValueOnce([
        {
          id: "notification-due-1",
          type: "task_due_date_reminder",
          title: "Due soon: Ship reminders",
          body: "Ship reminders is due in 3 days (May 25, 2026).",
          targetPath: "/projects/project-1?taskId=task-1",
          sourceType: "task_due_date_reminder",
          sourceId: "task-1:user-1:2026-05-25",
          metadata: {
            taskId: "task-1",
            taskTitle: "Ship reminders",
            projectId: "project-1",
            projectName: "Alpha",
            recipientUserId: "user-1",
            deadlineDate: "2026-05-25",
            daysUntilDue: 3,
            targetPath: "/projects/project-1?taskId=task-1",
          },
          readAt: null,
          resolvedAt: null,
          createdAt: new Date("2026-05-22T08:00:00.000Z"),
          updatedAt: new Date("2026-05-22T08:00:00.000Z"),
        },
      ]);

    const result = await listNotificationsForUser("user-1");

    expect(result.ok).toBe(true);
    expect(result.ok ? result.data.notifications[0]?.metadata : null).toEqual({
      taskId: "task-1",
      taskTitle: "Ship reminders",
      projectId: "project-1",
      projectName: "Alpha",
      recipientUserId: "user-1",
      deadlineDate: "2026-05-25",
      daysUntilDue: 3,
      targetPath: "/projects/project-1?taskId=task-1",
    });
  });

  test("counts unread unresolved notifications after syncing invitations", async () => {
    prismaMock.notification.count.mockResolvedValueOnce(2);

    const result = await countUnreadNotificationsForUser("user-1");

    expect(result).toBe(2);
    expect(prismaMock.notification.count).toHaveBeenCalledWith({
      where: {
        recipientUserId: "user-1",
        resolvedAt: null,
        readAt: null,
      },
    });
  });

  test("fetches only the latest unread unresolved notification for awareness", async () => {
    prismaMock.notification.findFirst.mockResolvedValueOnce({
      title: "Mentioned in: Task C",
    });

    const result = await getLatestUnreadNotificationForUser("user-1");

    expect(result).toEqual({
      ok: true,
      status: 200,
      data: {
        notification: {
          title: "Mentioned in: Task C",
        },
      },
    });
    expect(prismaMock.notification.findFirst).toHaveBeenCalledWith({
      where: {
        recipientUserId: "user-1",
        resolvedAt: null,
        readAt: null,
      },
      orderBy: [{ createdAt: "desc" }],
      select: {
        title: true,
      },
    });
  });

  test("does not refresh existing active invitation notifications during count sync", async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([
      {
        invitationId: "invite-1",
        projectId: "project-1",
        projectName: "Shared Project",
        invitedEmail: "invitee@example.com",
        invitedByEmail: "owner@example.com",
        invitedByName: "Owner",
        invitedByUsername: "owner",
        invitedByUsernameDiscriminator: "4321",
        invitationRole: "viewer",
        createdAt: new Date("2026-04-29T08:00:00.000Z"),
        expiresAt: new Date("2026-05-13T08:00:00.000Z"),
      },
    ]);
    prismaMock.notification.findMany.mockResolvedValueOnce([
      {
        sourceId: "invite-1",
        resolvedAt: null,
      },
    ]);
    prismaMock.notification.count.mockResolvedValueOnce(1);

    const result = await countUnreadNotificationsForUser("user-1");

    expect(result).toBe(1);
    expect(prismaMock.notification.createMany).not.toHaveBeenCalled();
    expect(prismaMock.notification.updateMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.notification.updateMany).toHaveBeenCalledWith({
      where: {
        recipientUserId: "user-1",
        sourceType: "project_invitation",
        sourceId: {
          notIn: ["invite-1"],
        },
        resolvedAt: null,
      },
      data: {
        resolvedAt: expect.any(Date),
      },
    });
  });

  test("marks a recipient-owned notification read", async () => {
    const result = await setNotificationReadState({
      actorUserId: "user-1",
      notificationId: "notification-1",
      read: true,
    });

    expect(result.ok).toBe(true);
    expect(prismaMock.notification.updateMany).toHaveBeenCalledWith({
      where: {
        id: "notification-1",
        recipientUserId: "user-1",
      },
      data: {
        readAt: expect.any(Date),
      },
    });
  });

  test("rejects mark-read when no recipient notification is updated", async () => {
    prismaMock.notification.updateMany.mockResolvedValueOnce({ count: 0 });

    const result = await setNotificationReadState({
      actorUserId: "user-1",
      notificationId: "notification-2",
      read: true,
    });

    expect(result).toEqual({
      ok: false,
      status: 404,
      error: "notification-not-found",
    });
  });

  test("returns a typed error when notification read-state update fails", async () => {
    const error = new Error("update failed");
    prismaMock.notification.updateMany.mockRejectedValueOnce(error);

    const result = await setNotificationReadState({
      actorUserId: "user-1",
      notificationId: "notification-1",
      read: true,
    });

    expect(result).toEqual({
      ok: false,
      status: 500,
      error: "notification-update-failed",
    });
    expect(logServerErrorMock).toHaveBeenCalledWith(
      "setNotificationReadState",
      error
    );
  });

  test("marks all visible recipient notifications read", async () => {
    prismaMock.notification.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 4 });

    const result = await markAllNotificationsReadForUser("user-1");

    expect(result).toEqual({
      ok: true,
      status: 200,
      data: {
        updatedCount: 4,
      },
    });
    expect(prismaMock.notification.updateMany).toHaveBeenLastCalledWith({
      where: {
        recipientUserId: "user-1",
        resolvedAt: null,
        readAt: null,
      },
      data: {
        readAt: expect.any(Date),
      },
    });
  });

  test("returns a typed error when marking all notifications read fails", async () => {
    const error = new Error("bulk update failed");
    prismaMock.notification.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockRejectedValueOnce(error);

    const result = await markAllNotificationsReadForUser("user-1");

    expect(result).toEqual({
      ok: false,
      status: 500,
      error: "notification-update-failed",
    });
    expect(logServerErrorMock).toHaveBeenCalledWith(
      "markAllNotificationsReadForUser",
      error
    );
  });

  test("resolves project invitation notifications by source id", async () => {
    await resolveProjectInvitationNotifications({
      db: prismaMock as never,
      invitationIds: ["invite-1", "invite-2"],
    });

    expect(prismaMock.notification.updateMany).toHaveBeenCalledWith({
      where: {
        sourceType: "project_invitation",
        sourceId: {
          in: ["invite-1", "invite-2"],
        },
        resolvedAt: null,
      },
      data: {
        resolvedAt: expect.any(Date),
        readAt: expect.any(Date),
      },
    });
  });

  test("creates one due-date reminder notification for a task recipient deadline window", async () => {
    const storedNotification = {
      id: "notification-due-1",
      recipientUserId: "user-1",
      type: "task_due_date_reminder",
      title: "Due soon: Ship reminders",
      body: "Ship reminders is due in 3 days (May 25, 2026).",
      targetPath: "/projects/project-1?taskId=task-1",
      sourceType: "task_due_date_reminder",
      sourceId: "task-1:user-1:2026-05-25",
      metadata: {
        taskId: "task-1",
        taskTitle: "Ship reminders",
        projectId: "project-1",
        projectName: "Alpha",
        recipientUserId: "user-1",
        deadlineDate: "2026-05-25",
        daysUntilDue: 3,
        targetPath: "/projects/project-1?taskId=task-1",
      },
      readAt: null,
      resolvedAt: null,
      createdAt: new Date("2026-05-22T08:00:00.000Z"),
      updatedAt: new Date("2026-05-22T08:00:00.000Z"),
    };
    prismaMock.notification.findMany.mockResolvedValueOnce([]);
    prismaMock.notification.findFirst.mockResolvedValueOnce(storedNotification);

    await createTaskDueDateReminderNotification({
      db: prismaMock as never,
      recipientUserId: "user-1",
      notification: {
        taskId: "task-1",
        taskTitle: "Ship reminders",
        projectId: "project-1",
        projectName: "Alpha",
        recipientUserId: "stale-user",
        deadlineDate: "2026-05-25",
        daysUntilDue: 3,
        targetPath: "/projects/project-1?taskId=task-1",
      },
    });

    expect(prismaMock.notification.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          recipientUserId: "user-1",
          type: "task_due_date_reminder",
          sourceType: "task_due_date_reminder",
          sourceId: "task-1:user-1:2026-05-25",
          metadata: expect.objectContaining({
            recipientUserId: "user-1",
            deadlineDate: "2026-05-25",
            daysUntilDue: 3,
          }),
        }),
      ],
      skipDuplicates: true,
    });
    expect(enqueueEmailMock).toHaveBeenCalledWith({
      db: prismaMock,
      notification: storedNotification,
    });
  });
});
