import { beforeEach, describe, expect, test, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  user: {
    findMany: vi.fn(),
  },
  notification: {
    findMany: vi.fn(),
  },
  projectInvitation: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  projectNotificationEmail: {
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  projectNotificationEmailItem: {
    findMany: vi.fn(),
  },
}));

const outboundEmailMock = vi.hoisted(() => ({
  sendOutboundEmail: vi.fn(),
}));

const loggerMock = vi.hoisted(() => ({
  logServerError: vi.fn(),
  logServerInfo: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/services/outbound-email-service", () => ({
  sendOutboundEmail: outboundEmailMock.sendOutboundEmail,
}));

vi.mock("@/lib/observability/logger", () => loggerMock);

import { dispatchProjectNotificationEmails } from "@/lib/services/project-notification-email-service";

const now = new Date("2026-05-08T12:00:00.000Z");
const oldDate = new Date("2026-05-08T11:00:00.000Z");
const recentDate = new Date("2026-05-08T11:45:00.000Z");

function mentionNotification(overrides: Record<string, unknown> = {}) {
  return {
    id: "notification-mention-1",
    type: "task_comment_mention",
    title: "Mentioned in: Ship digest",
    body: "Agent mentioned you.",
    targetPath: "/projects/project-1?taskId=task-1&commentId=comment-1",
    sourceType: "task_comment_mention",
    sourceId: "comment-1",
    metadata: {
      commentId: "comment-1",
      taskId: "task-1",
      taskTitle: "Ship digest",
      projectId: "project-1",
      projectName: "Email Project",
      mentionedUsername: "dorian",
      mentionedUserId: "user-1",
      mentionedUserDisplayName: "Dorian",
      authorUsername: "agent",
      authorDisplayName: "Agent",
      targetPath: "/projects/project-1?taskId=task-1&commentId=comment-1",
    },
    readAt: null,
    resolvedAt: null,
    createdAt: oldDate,
    updatedAt: oldDate,
    ...overrides,
  };
}

function assignmentNotification(overrides: Record<string, unknown> = {}) {
  return {
    id: "notification-assignment-1",
    type: "task_assignment",
    title: "Assigned: Review digest",
    body: "Owner assigned you.",
    targetPath: "/projects/project-1?taskId=task-2",
    sourceType: "task_assignment",
    sourceId: "task-2",
    metadata: {
      taskId: "task-2",
      taskTitle: "Review digest",
      projectId: "project-1",
      projectName: "Email Project",
      assignedUserId: "user-1",
      assignedUserDisplayName: "Dorian",
      actorUserId: "owner-1",
      actorDisplayName: "Owner",
      targetPath: "/projects/project-1?taskId=task-2",
    },
    readAt: null,
    resolvedAt: null,
    createdAt: oldDate,
    updatedAt: oldDate,
    ...overrides,
  };
}

function invitationNotification(overrides: Record<string, unknown> = {}) {
  return {
    id: "notification-invite-1",
    type: "project_invitation",
    title: "Project invitation: Email Project",
    body: "Owner invited you.",
    targetPath: "/invite/project/invite-1",
    sourceType: "project_invitation",
    sourceId: "invite-1",
    metadata: {
      invitationId: "invite-1",
      projectId: "project-1",
      projectName: "Email Project",
      invitedEmail: "dorian.agaesse@gmail.com",
      invitedByDisplayName: "Owner",
      invitedByEmail: "owner@example.com",
      role: "editor",
      expiresAt: "2026-05-09T11:00:00.000Z",
      inviteLinkPath: "/invite/project/invite-1",
    },
    readAt: null,
    resolvedAt: null,
    createdAt: new Date("2026-05-08T05:00:00.000Z"),
    updatedAt: new Date("2026-05-08T05:00:00.000Z"),
    ...overrides,
  };
}

describe("project-notification-email-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findMany.mockResolvedValue([
      {
        id: "user-1",
        email: "dorian.agaesse@gmail.com",
        name: "Dorian",
      },
    ]);
    prismaMock.notification.findMany.mockResolvedValue([]);
    prismaMock.projectNotificationEmailItem.findMany.mockResolvedValue([]);
    prismaMock.projectNotificationEmail.findFirst.mockResolvedValue(null);
    prismaMock.projectNotificationEmail.create.mockResolvedValue({
      id: "email-1",
    });
    prismaMock.projectNotificationEmail.update.mockResolvedValue({
      id: "email-1",
    });
    prismaMock.projectInvitation.findMany.mockResolvedValue([]);
    prismaMock.projectInvitation.findUnique.mockResolvedValue(null);
    outboundEmailMock.sendOutboundEmail.mockResolvedValue({
      ok: true,
      delivery: "sent",
      deliveryId: "delivery-1",
      provider: "resend",
      providerMessageId: "provider-1",
    });
  });

  test("sends a quiet-window digest for grouped project notifications", async () => {
    prismaMock.notification.findMany
      .mockResolvedValueOnce([
        mentionNotification(),
        mentionNotification({
          id: "notification-mention-2",
          sourceId: "comment-2",
          metadata: {
            ...mentionNotification().metadata,
            commentId: "comment-2",
          },
        }),
        assignmentNotification(),
      ])
      .mockResolvedValueOnce([]);

    const summary = await dispatchProjectNotificationEmails({
      appOrigin: "https://preview.nexusdash.test",
      now,
    });

    expect(summary).toMatchObject({
      digestsAttempted: 1,
      digestsSent: 1,
      digestsFailed: 0,
    });
    expect(prismaMock.projectNotificationEmail.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: "project_digest",
          recipientUserId: "user-1",
          projectId: "project-1",
          notificationCount: 3,
        }),
      })
    );
    expect(outboundEmailMock.sendOutboundEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        templateKey: "project_notification_digest",
        to: "dorian.agaesse@gmail.com",
        subject: "3 updates for Email Project on NexusDash",
        text: expect.stringContaining("2x Agent mentioned you on Ship digest"),
        metadata: expect.objectContaining({
          projectId: "project-1",
          notificationCount: 3,
        }),
      })
    );
  });

  test("does not send while the latest notification is still inside the quiet window", async () => {
    prismaMock.notification.findMany
      .mockResolvedValueOnce([
        mentionNotification({
          updatedAt: recentDate,
        }),
      ])
      .mockResolvedValueOnce([]);

    const summary = await dispatchProjectNotificationEmails({
      appOrigin: "https://preview.nexusdash.test",
      now,
    });

    expect(summary.digestsAttempted).toBe(0);
    expect(prismaMock.projectNotificationEmail.create).not.toHaveBeenCalled();
    expect(outboundEmailMock.sendOutboundEmail).not.toHaveBeenCalled();
  });

  test("does not resend notifications already covered by a digest", async () => {
    prismaMock.notification.findMany
      .mockResolvedValueOnce([mentionNotification()])
      .mockResolvedValueOnce([]);
    prismaMock.projectNotificationEmailItem.findMany.mockResolvedValueOnce([
      {
        notificationId: "notification-mention-1",
      },
    ]);

    const summary = await dispatchProjectNotificationEmails({
      appOrigin: "https://preview.nexusdash.test",
      now,
    });

    expect(summary.digestsAttempted).toBe(0);
    expect(prismaMock.projectNotificationEmailItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          email: expect.objectContaining({
            kind: "project_digest",
            OR: expect.arrayContaining([
              expect.objectContaining({
                status: {
                  in: ["sent", "skipped"],
                },
              }),
              expect.objectContaining({
                status: "pending",
              }),
            ]),
          }),
        }),
      })
    );
    expect(outboundEmailMock.sendOutboundEmail).not.toHaveBeenCalled();
  });

  test("retries a failed digest tracking row instead of permanently covering notifications", async () => {
    prismaMock.notification.findMany
      .mockResolvedValueOnce([mentionNotification()])
      .mockResolvedValueOnce([]);
    prismaMock.projectNotificationEmail.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "email-failed",
      });

    const summary = await dispatchProjectNotificationEmails({
      appOrigin: "https://preview.nexusdash.test",
      now,
    });

    expect(summary.digestsSent).toBe(1);
    expect(prismaMock.projectNotificationEmail.create).not.toHaveBeenCalled();
    expect(prismaMock.projectNotificationEmail.update).toHaveBeenNthCalledWith(1, {
      where: { id: "email-failed" },
      data: {
        status: "pending",
        outboundEmailDeliveryId: null,
        errorCode: null,
        completedAt: null,
      },
    });
    expect(prismaMock.projectNotificationEmail.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: "email-failed" },
        data: expect.objectContaining({
          status: "sent",
        }),
      })
    );
  });

  test("records provider failure on the digest tracking row", async () => {
    prismaMock.notification.findMany
      .mockResolvedValueOnce([mentionNotification()])
      .mockResolvedValueOnce([]);
    outboundEmailMock.sendOutboundEmail.mockResolvedValueOnce({
      ok: false,
      error: "provider-rejected",
      deliveryId: "delivery-1",
      provider: "resend",
      providerStatus: 422,
    });

    const summary = await dispatchProjectNotificationEmails({
      appOrigin: "https://preview.nexusdash.test",
      now,
    });

    expect(summary.digestsFailed).toBe(1);
    expect(prismaMock.projectNotificationEmail.update).toHaveBeenCalledWith({
      where: { id: "email-1" },
      data: expect.objectContaining({
        status: "failed",
        outboundEmailDeliveryId: "delivery-1",
        errorCode: "provider-rejected",
      }),
    });
  });

  test("sends a six-hour invitation reminder once", async () => {
    prismaMock.notification.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([invitationNotification()]);
    prismaMock.projectInvitation.findMany.mockResolvedValueOnce([{
      id: "invite-1",
      invitedEmail: "dorian.agaesse@gmail.com",
      role: "editor",
      expiresAt: new Date("2026-05-09T11:00:00.000Z"),
      acceptedAt: null,
      revokedAt: null,
      replacedAt: null,
      project: {
        id: "project-1",
        name: "Email Project",
      },
      invitedByUser: {
        email: "owner@example.com",
        name: "Owner",
        username: null,
        usernameDiscriminator: null,
      },
    }]);

    const summary = await dispatchProjectNotificationEmails({
      appOrigin: "https://preview.nexusdash.test",
      now,
    });

    expect(summary).toMatchObject({
      invitationRemindersAttempted: 1,
      invitationRemindersSent: 1,
    });
    expect(prismaMock.projectNotificationEmail.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: "project_invitation_reminder",
          sourceKey: "invite-1",
          notificationCount: 1,
        }),
      })
    );
    expect(outboundEmailMock.sendOutboundEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        templateKey: "project_invitation",
        to: "dorian.agaesse@gmail.com",
        subject: "Reminder: invitation to Email Project on NexusDash",
        metadata: expect.objectContaining({
          deliveryReason: "six_hour_invitation_reminder",
        }),
      })
    );
    expect(prismaMock.projectInvitation.findMany).toHaveBeenCalledTimes(1);
  });

  test("skips invitation reminders that already have tracking items", async () => {
    prismaMock.notification.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([invitationNotification()]);
    prismaMock.projectNotificationEmailItem.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          notificationId: "notification-invite-1",
        },
      ]);

    const summary = await dispatchProjectNotificationEmails({
      appOrigin: "https://preview.nexusdash.test",
      now,
    });

    expect(summary.invitationRemindersAttempted).toBe(0);
    expect(outboundEmailMock.sendOutboundEmail).not.toHaveBeenCalled();
  });
});
