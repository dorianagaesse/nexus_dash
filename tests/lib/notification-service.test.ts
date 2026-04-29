import { beforeEach, describe, expect, test, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  notification: {
    count: vi.fn(),
    createMany: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
}));

const logServerErrorMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/observability/logger", () => ({
  logServerError: logServerErrorMock,
}));

import {
  countUnreadNotificationsForUser,
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
        invitedByUserId: "owner-1",
        invitedByEmail: "owner@example.com",
        invitedByName: "Owner",
        invitedByUsername: "owner",
        invitedByUsernameDiscriminator: "4321",
        invitationRole: "editor",
        createdAt: new Date("2026-04-29T08:00:00.000Z"),
        expiresAt: new Date("2026-05-13T08:00:00.000Z"),
      },
    ]);
    prismaMock.notification.findMany.mockResolvedValueOnce([
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
});
