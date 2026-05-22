import { beforeEach, describe, expect, test, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  user: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  notification: {
    createMany: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  projectInvitation: {
    findFirst: vi.fn(),
  },
  projectNotificationEmail: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  projectNotificationEmailItem: {
    count: vi.fn(),
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
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

import {
  dispatchProjectNotificationEmails,
  enqueueNotificationEmailForNotification,
} from "@/lib/services/project-notification-email-service";

const now = new Date("2026-05-13T12:00:00.000Z");
const oldDate = new Date("2026-05-13T11:00:00.000Z");

function mentionNotification(overrides: Record<string, unknown> = {}) {
  return {
    id: "notification-mention-1",
    recipientUserId: "user-1",
    type: "task_comment_mention",
    title: "Mentioned in: Ship orchestration",
    body: "Agent mentioned you.",
    targetPath: "/projects/project-1?taskId=task-1&commentId=comment-1",
    sourceType: "task_comment_mention",
    sourceId: "comment-1",
    metadata: {
      commentId: "comment-1",
      taskId: "task-1",
      taskTitle: "Ship orchestration",
      projectId: "project-1",
      projectName: "Alpha",
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
    recipientUserId: "user-1",
    type: "task_assignment",
    title: "Assigned: Review queue",
    body: "Owner assigned you.",
    targetPath: "/projects/project-2?taskId=task-2",
    sourceType: "task_assignment",
    sourceId: "task-2",
    metadata: {
      taskId: "task-2",
      taskTitle: "Review queue",
      projectId: "project-2",
      projectName: "Beta",
      assignedUserId: "user-1",
      assignedUserDisplayName: "Dorian",
      actorUserId: "owner-1",
      actorDisplayName: "Owner",
      targetPath: "/projects/project-2?taskId=task-2",
    },
    readAt: null,
    resolvedAt: null,
    createdAt: oldDate,
    updatedAt: oldDate,
    ...overrides,
  };
}

function dueDateReminderNotification(overrides: Record<string, unknown> = {}) {
  return {
    id: "notification-due-1",
    recipientUserId: "user-1",
    type: "task_due_date_reminder",
    title: "Due soon: Ship reminders",
    body: "Ship reminders is due in 3 days (May 16, 2026).",
    targetPath: "/projects/project-1?taskId=task-1",
    sourceType: "task_due_date_reminder",
    sourceId: "task-1:user-1:2026-05-16",
    metadata: {
      taskId: "task-1",
      taskTitle: "Ship reminders",
      projectId: "project-1",
      projectName: "Alpha",
      recipientUserId: "user-1",
      deadlineDate: "2026-05-16",
      daysUntilDue: 3,
      targetPath: "/projects/project-1?taskId=task-1",
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
    recipientUserId: "user-1",
    type: "project_invitation",
    title: "Project invitation: Alpha",
    body: "Owner invited you.",
    targetPath: "/invite/project/invite-1",
    sourceType: "project_invitation",
    sourceId: "invite-1",
    metadata: {
      invitationId: "invite-1",
      projectId: "project-1",
      projectName: "Alpha",
      invitedEmail: "dorian.agaesse@gmail.com",
      invitedByDisplayName: "Owner",
      invitedByEmail: "owner@example.com",
      role: "editor",
      expiresAt: "2026-05-14T11:00:00.000Z",
      inviteLinkPath: "/invite/project/invite-1",
    },
    readAt: null,
    resolvedAt: null,
    createdAt: new Date("2026-05-13T05:00:00.000Z"),
    updatedAt: new Date("2026-05-13T05:00:00.000Z"),
    ...overrides,
  };
}

function claimedGroup(input: {
  id: string;
  kind?: "project_digest" | "project_invitation_reminder";
  projectId: string;
  projectName: string;
  notification: ReturnType<typeof mentionNotification>;
}) {
  return {
    id: input.id,
    kind: input.kind ?? "project_digest",
    recipientUserId: "user-1",
    projectId: input.projectId,
    sourceKey: input.notification.id,
    groupingKey: `${input.kind ?? "project_digest"}:user-1:${input.projectId}`,
    firstPendingNotificationAt: input.notification.createdAt,
    latestPendingNotificationAt: input.notification.updatedAt,
    sendAfterAt: new Date("2026-05-13T11:30:00.000Z"),
    maxSendAt: new Date("2026-05-13T12:00:00.000Z"),
    windowStartedAt: input.notification.createdAt,
    windowEndedAt: input.notification.updatedAt,
    latestNotificationAt: input.notification.updatedAt,
    notificationCount: 1,
    recipient: {
      id: "user-1",
      email: "dorian.agaesse@gmail.com",
      emailVerified: new Date("2026-05-01T00:00:00.000Z"),
      name: "Dorian",
    },
    project: {
      id: input.projectId,
      name: input.projectName,
    },
    items: [
      {
        id: `${input.id}-item`,
        notificationId: input.notification.id,
        notificationUpdatedAt: input.notification.updatedAt,
        sourceFingerprint: `${input.notification.id}:${input.notification.updatedAt.toISOString()}`,
        notification: input.notification,
      },
    ],
  };
}

describe("project-notification-email-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findMany.mockResolvedValue([{ id: "user-1" }]);
    prismaMock.user.findUnique.mockResolvedValue({
      email: "dorian.agaesse@gmail.com",
      emailVerified: new Date("2026-05-01T00:00:00.000Z"),
    });
    prismaMock.notification.createMany.mockResolvedValue({ count: 1 });
    prismaMock.notification.findFirst.mockResolvedValue(dueDateReminderNotification());
    prismaMock.notification.findMany.mockResolvedValue([]);
    prismaMock.projectInvitation.findFirst.mockResolvedValue({ id: "invite-1" });
    prismaMock.projectNotificationEmail.create.mockResolvedValue({
      id: "email-1",
    });
    prismaMock.projectNotificationEmail.findFirst.mockResolvedValue(null);
    prismaMock.projectNotificationEmail.findMany.mockResolvedValue([]);
    prismaMock.projectNotificationEmail.update.mockResolvedValue({
      id: "email-1",
    });
    prismaMock.projectNotificationEmail.updateMany.mockResolvedValue({
      count: 0,
    });
    prismaMock.projectNotificationEmailItem.count.mockResolvedValue(1);
    prismaMock.projectNotificationEmailItem.findFirst.mockResolvedValue(null);
    prismaMock.projectNotificationEmailItem.findMany.mockResolvedValue([]);
    prismaMock.$queryRaw.mockResolvedValue([]);
    outboundEmailMock.sendOutboundEmail.mockResolvedValue({
      ok: true,
      delivery: "sent",
      deliveryId: "delivery-1",
      provider: "resend",
      providerMessageId: "provider-1",
    });
  });

  test("ingests a project activity notification into a debounced pending group", async () => {
    await enqueueNotificationEmailForNotification({
      db: prismaMock as never,
      notification: mentionNotification(),
    });

    expect(prismaMock.projectNotificationEmail.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: "project_digest",
          recipientUserId: "user-1",
          projectId: "project-1",
          groupingKey: "project_digest:user-1:project-1",
          firstPendingNotificationAt: oldDate,
          latestPendingNotificationAt: oldDate,
          sendAfterAt: new Date("2026-05-13T11:30:00.000Z"),
          maxSendAt: new Date("2026-05-13T12:00:00.000Z"),
        }),
      })
    );
  });

  test("extends the quiet window but caps send-after at the maximum delay", async () => {
    prismaMock.projectNotificationEmail.findFirst.mockResolvedValueOnce({
      id: "email-1",
      firstPendingNotificationAt: new Date("2026-05-13T10:50:00.000Z"),
      latestPendingNotificationAt: new Date("2026-05-13T10:50:00.000Z"),
    });
    prismaMock.projectNotificationEmailItem.count.mockResolvedValueOnce(2);

    await enqueueNotificationEmailForNotification({
      db: prismaMock as never,
      notification: mentionNotification({
        id: "notification-mention-2",
        sourceId: "comment-2",
        createdAt: new Date("2026-05-13T11:40:00.000Z"),
        updatedAt: new Date("2026-05-13T11:40:00.000Z"),
        metadata: {
          ...mentionNotification().metadata,
          commentId: "comment-2",
        },
      }),
    });

    expect(prismaMock.projectNotificationEmail.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "email-1" },
        data: expect.objectContaining({
          latestPendingNotificationAt: new Date("2026-05-13T11:40:00.000Z"),
          sendAfterAt: new Date("2026-05-13T11:50:00.000Z"),
          maxSendAt: new Date("2026-05-13T11:50:00.000Z"),
          notificationCount: 2,
        }),
      })
    );
  });

  test("does not enqueue a notification already sent even if it changed later", async () => {
    prismaMock.projectNotificationEmailItem.findFirst.mockResolvedValueOnce({
      id: "item-1",
    });

    await enqueueNotificationEmailForNotification({
      db: prismaMock as never,
      notification: mentionNotification(),
    });

    expect(prismaMock.projectNotificationEmail.create).not.toHaveBeenCalled();
    expect(prismaMock.projectNotificationEmailItem.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          notificationId: "notification-mention-1",
          OR: expect.arrayContaining([
            expect.objectContaining({
              email: expect.objectContaining({
                status: {
                  in: ["sent"],
                },
              }),
            }),
          ]),
        }),
      })
    );
  });

  test("creates invitation reminder groups for the six-hour reminder window", async () => {
    await enqueueNotificationEmailForNotification({
      db: prismaMock as never,
      notification: invitationNotification(),
    });

    expect(prismaMock.projectNotificationEmail.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: "project_invitation_reminder",
          sourceKey: "invite-1",
          groupingKey: "project_invitation_reminder:user-1:project-1:invite-1",
          sendAfterAt: new Date("2026-05-13T11:00:00.000Z"),
          maxSendAt: new Date("2026-05-13T11:00:00.000Z"),
        }),
      })
    );
  });

  test("ingests due-date reminder notifications into the shared project digest queue", async () => {
    await enqueueNotificationEmailForNotification({
      db: prismaMock as never,
      notification: dueDateReminderNotification(),
    });

    expect(prismaMock.projectNotificationEmail.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: "project_digest",
          recipientUserId: "user-1",
          projectId: "project-1",
          groupingKey: "project_digest:user-1:project-1",
          firstPendingNotificationAt: oldDate,
          latestPendingNotificationAt: oldDate,
        }),
      })
    );
  });

  test("reconciles tasks due in three days into durable reminder notifications", async () => {
    prismaMock.$queryRaw
      .mockResolvedValueOnce([
        {
          taskId: "task-1",
          taskTitle: "Ship reminders",
          projectId: "project-1",
          projectName: "Alpha",
          recipientUserId: "user-1",
          deadlineAt: new Date("2026-05-16T00:00:00.000Z"),
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const summary = await dispatchProjectNotificationEmails({
      appOrigin: "https://preview.nexusdash.test",
      now,
    });

    expect(summary.dueDateRemindersReconciled).toBe(1);
    expect(prismaMock.notification.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          recipientUserId: "user-1",
          type: "task_due_date_reminder",
          title: "Due soon: Ship reminders",
          sourceType: "task_due_date_reminder",
          sourceId: "task-1:user-1:2026-05-16",
          targetPath: "/projects/project-1?taskId=task-1",
          metadata: expect.objectContaining({
            deadlineDate: "2026-05-16",
            daysUntilDue: 3,
          }),
        }),
      ],
      skipDuplicates: true,
    });
  });

  test("uses the eligibility query for due-date reminder access and idempotency", async () => {
    await dispatchProjectNotificationEmails({
      appOrigin: "https://preview.nexusdash.test",
      now,
    });

    const dueDateQuery = prismaMock.$queryRaw.mock.calls[0]?.[0] as
      | { strings: string[] }
      | undefined;
    const sql = dueDateQuery?.strings.join(" ") ?? "";

    expect(sql).toContain('task."deadlineAt" = CAST(');
    expect(sql).toContain('task."status" <> \'Done\'');
    expect(sql).toContain('task."archivedAt" IS NULL');
    expect(sql).toContain('task."assigneeUserId" =');
    expect(sql).toContain('task."assigneeUserId" IS NULL');
    expect(sql).toContain('task."createdByUserId" =');
    expect(sql).toContain('notification."sourceType" =');
    expect(sql).toContain('notification."sourceId"');
    expect(sql).toContain('notification."readAt" IS NOT NULL');
    expect(sql).toContain('notification."resolvedAt" IS NOT NULL');
    expect(sql).toContain('"ProjectNotificationEmailItem" item');
    expect(sql).toContain("email.\"status\" IN ('pending', 'dispatching', 'sent')");
    expect(prismaMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          email: { not: null },
          emailVerified: { not: null },
        }),
      })
    );
  });

  test("discovers due-date reminders once per verified recipient under recipient context", async () => {
    prismaMock.user.findMany.mockResolvedValueOnce([
      { id: "user-1" },
      { id: "user-2" },
    ]);

    await dispatchProjectNotificationEmails({
      appOrigin: "https://preview.nexusdash.test",
      now,
    });

    const dueDateQueries = prismaMock.$queryRaw.mock.calls
      .slice(0, 2)
      .map((call) => (call[0] as { strings: string[] }).strings.join(" "));

    expect(dueDateQueries).toHaveLength(2);
    expect(dueDateQueries.every((sql) => sql.includes('FROM "Task" task'))).toBe(
      true
    );
  });

  test("batches multiple due project groups into one recipient email", async () => {
    const mention = mentionNotification();
    const assignment = assignmentNotification();
    prismaMock.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: "email-1" },
        { id: "email-2" },
      ]);
    prismaMock.projectNotificationEmail.findMany
      .mockResolvedValueOnce([{ recipientUserId: "user-1" }])
      .mockResolvedValueOnce([
        claimedGroup({
          id: "email-1",
          projectId: "project-1",
          projectName: "Alpha",
          notification: mention,
        }),
        claimedGroup({
          id: "email-2",
          projectId: "project-2",
          projectName: "Beta",
          notification: assignment,
        }),
      ]);

    const summary = await dispatchProjectNotificationEmails({
      appOrigin: "https://preview.nexusdash.test",
      now,
    });

    expect(summary).toMatchObject({
      groupsClaimed: 2,
      recipientEmailsAttempted: 1,
      recipientEmailsSent: 1,
      groupsSent: 2,
    });
    expect(outboundEmailMock.sendOutboundEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        templateKey: "project_notification_digest",
        to: "dorian.agaesse@gmail.com",
        subject: "2 updates across 2 projects on NexusDash",
        text: expect.stringContaining("Alpha"),
        metadata: expect.objectContaining({
          projectIds: ["project-1", "project-2"],
          groupIds: ["email-1", "email-2"],
        }),
      })
    );
  });

  test("renders due-date reminder items in recipient digest emails", async () => {
    prismaMock.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "email-1" }]);
    prismaMock.projectNotificationEmail.findMany
      .mockResolvedValueOnce([{ recipientUserId: "user-1" }])
      .mockResolvedValueOnce([
        claimedGroup({
          id: "email-1",
          projectId: "project-1",
          projectName: "Alpha",
          notification: dueDateReminderNotification(),
        }),
      ]);

    const summary = await dispatchProjectNotificationEmails({
      appOrigin: "https://preview.nexusdash.test",
      now,
    });

    expect(summary).toMatchObject({
      groupsClaimed: 1,
      recipientEmailsSent: 1,
      groupsSent: 1,
    });
    expect(outboundEmailMock.sendOutboundEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        templateKey: "project_notification_digest",
        subject: "1 update for Alpha on NexusDash",
        text: expect.stringContaining(
          "Due in 3 days: Ship reminders (May 16, 2026)"
        ),
      })
    );
  });

  test("uses mention actor display name over legacy author display name", async () => {
    const mention = mentionNotification({
      metadata: {
        ...mentionNotification().metadata,
        authorDisplayName: "Credential Owner",
        actorDisplayName: "Build bot (agent)",
      },
    });
    prismaMock.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "email-1" }]);
    prismaMock.projectNotificationEmail.findMany
      .mockResolvedValueOnce([{ recipientUserId: "user-1" }])
      .mockResolvedValueOnce([
        claimedGroup({
          id: "email-1",
          projectId: "project-1",
          projectName: "Alpha",
          notification: mention,
        }),
      ]);

    await dispatchProjectNotificationEmails({
      appOrigin: "https://preview.nexusdash.test",
      now,
    });

    expect(outboundEmailMock.sendOutboundEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining(
          "Build bot (agent) mentioned you on Ship orchestration"
        ),
      })
    );
    expect(outboundEmailMock.sendOutboundEmail).not.toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining(
          "Credential Owner mentioned you on Ship orchestration"
        ),
      })
    );
  });

  test("marks provider failures on all groups in the recipient batch", async () => {
    prismaMock.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "email-1" }]);
    prismaMock.projectNotificationEmail.findMany
      .mockResolvedValueOnce([{ recipientUserId: "user-1" }])
      .mockResolvedValueOnce([
        claimedGroup({
          id: "email-1",
          projectId: "project-1",
          projectName: "Alpha",
          notification: mentionNotification(),
        }),
      ]);
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

    expect(summary.recipientEmailsFailed).toBe(1);
    expect(summary.groupsFailed).toBe(1);
    expect(prismaMock.projectNotificationEmail.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["email-1"] } },
        data: expect.objectContaining({
          status: "failed",
          outboundEmailDeliveryId: "delivery-1",
          errorCode: "provider-rejected",
        }),
      })
    );
  });

  test("does not send when no groups are claimed, preserving repeated-call idempotency", async () => {
    const summary = await dispatchProjectNotificationEmails({
      appOrigin: "https://preview.nexusdash.test",
      now,
    });

    expect(summary.groupsClaimed).toBe(0);
    expect(outboundEmailMock.sendOutboundEmail).not.toHaveBeenCalled();
  });

  test("reconcile suppresses already-delivered notifications by id", async () => {
    await dispatchProjectNotificationEmails({
      appOrigin: "https://preview.nexusdash.test",
      now,
    });

    const reconcileQuery = prismaMock.$queryRaw.mock.calls[1]?.[0] as
      | { strings: string[] }
      | undefined;
    const sql = reconcileQuery?.strings.join(" ") ?? "";

    expect(sql).toContain("email.\"status\" = 'sent'");
    expect(sql).toContain(
      "item.\"notificationUpdatedAt\" = notification.\"updatedAt\""
    );
    expect(sql).toContain("email.\"status\" IN ('pending', 'dispatching')");
  });

  test("skips stale pending groups whose notifications were already sent elsewhere", async () => {
    prismaMock.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "email-1" }]);
    prismaMock.projectNotificationEmail.findMany
      .mockResolvedValueOnce([{ recipientUserId: "user-1" }])
      .mockResolvedValueOnce([
        claimedGroup({
          id: "email-1",
          projectId: "project-1",
          projectName: "Alpha",
          notification: mentionNotification(),
        }),
      ]);
    prismaMock.projectNotificationEmailItem.findMany.mockResolvedValueOnce([
      {
        notificationId: "notification-mention-1",
      },
    ]);

    const summary = await dispatchProjectNotificationEmails({
      appOrigin: "https://preview.nexusdash.test",
      now,
    });

    expect(summary).toMatchObject({
      groupsClaimed: 1,
      recipientEmailsAttempted: 0,
      recipientEmailsSkipped: 1,
      groupsSkipped: 1,
    });
    expect(outboundEmailMock.sendOutboundEmail).not.toHaveBeenCalled();
    expect(prismaMock.projectNotificationEmail.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["email-1"] } },
        data: expect.objectContaining({
          status: "skipped",
          errorCode: "no-current-eligible-notifications",
        }),
      })
    );
  });

  test("releases stale dispatching groups back to pending for retry", async () => {
    await dispatchProjectNotificationEmails({
      appOrigin: "https://preview.nexusdash.test",
      now,
    });

    expect(prismaMock.projectNotificationEmail.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "dispatching",
          claimedAt: {
            lt: new Date("2026-05-13T11:30:00.000Z"),
          },
        }),
        data: expect.objectContaining({
          status: "pending",
          errorCode: "dispatch-claim-stale",
          claimToken: null,
          claimedAt: null,
          completedAt: null,
          sendAfterAt: now,
        }),
      })
    );
  });

  test("skips dispatch if the recipient email is no longer verified", async () => {
    const group = claimedGroup({
      id: "email-1",
      projectId: "project-1",
      projectName: "Alpha",
      notification: mentionNotification(),
    });
    prismaMock.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "email-1" }]);
    prismaMock.projectNotificationEmail.findMany
      .mockResolvedValueOnce([{ recipientUserId: "user-1" }])
      .mockResolvedValueOnce([
        {
          ...group,
          recipient: {
            ...group.recipient,
            emailVerified: null,
          },
        },
      ]);

    const summary = await dispatchProjectNotificationEmails({
      appOrigin: "https://preview.nexusdash.test",
      now,
    });

    expect(summary.groupsClaimed).toBe(1);
    expect(summary.recipientEmailsAttempted).toBe(0);
    expect(outboundEmailMock.sendOutboundEmail).not.toHaveBeenCalled();
  });

  test("claims due groups with the database query used for concurrent dispatch safety", async () => {
    await dispatchProjectNotificationEmails({
      appOrigin: "https://preview.nexusdash.test",
      now,
    });

    expect(
      prismaMock.$queryRaw.mock.calls.some((call) =>
        (call[0] as { strings: string[] }).strings
          .join(" ")
          .includes("FOR UPDATE SKIP LOCKED")
      )
    ).toBe(true);
  });
});
