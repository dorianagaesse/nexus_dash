import crypto from "node:crypto";

import { Prisma } from "@prisma/client";

import { logServerError, logServerInfo } from "@/lib/observability/logger";
import { prisma } from "@/lib/prisma";
import { sendOutboundEmail } from "@/lib/services/outbound-email-service";
import {
  buildProjectInvitationEmail,
  buildProjectNotificationDigestEmail,
  type ProjectNotificationDigestEmailItem,
} from "@/lib/services/outbound-email-templates";
import { type DbClient, withActorRlsContext } from "@/lib/services/rls-context";

const NOTIFICATION_TYPE_PROJECT_INVITATION = "project_invitation";
const NOTIFICATION_TYPE_TASK_COMMENT_MENTION = "task_comment_mention";
const NOTIFICATION_TYPE_TASK_ASSIGNMENT = "task_assignment";
const EMAIL_KIND_PROJECT_DIGEST = "project_digest";
const EMAIL_KIND_PROJECT_INVITATION_REMINDER = "project_invitation_reminder";
const QUIET_WINDOW_MS = 30 * 60 * 1000;
const INVITATION_REMINDER_AFTER_MS = 6 * 60 * 60 * 1000;
const PENDING_RETRY_GRACE_MS = 30 * 60 * 1000;
const MAX_GROUPS_PER_DISPATCH = 100;
const MAX_DIGEST_BODY_ITEMS = 12;

interface VerifiedRecipient {
  id: string;
  email: string;
  name: string | null;
}

interface NotificationRecord {
  id: string;
  type: string;
  title: string;
  body: string | null;
  targetPath: string | null;
  sourceType: string;
  sourceId: string;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
}

interface DigestCandidate {
  notification: NotificationRecord;
  projectId: string;
  projectName: string;
  taskId: string;
  taskTitle: string;
  actorDisplayName: string;
  targetPath: string;
  activityKind: "mention" | "assignment";
  activityAt: Date;
}

interface DigestGroup {
  recipient: VerifiedRecipient;
  projectId: string;
  projectName: string;
  candidates: DigestCandidate[];
  windowStartedAt: Date;
  windowEndedAt: Date;
  latestNotificationAt: Date;
}

interface InvitationReminderCandidate {
  recipient: VerifiedRecipient;
  notification: NotificationRecord;
  invitationId: string;
  projectId: string;
  projectName: string;
  invitedByDisplayName: string;
  role: "editor" | "viewer";
  expiresAt: Date;
  targetPath: string;
  createdAt: Date;
}

export interface DispatchProjectNotificationEmailsSummary {
  usersScanned: number;
  digestsAttempted: number;
  digestsSent: number;
  digestsSkipped: number;
  digestsFailed: number;
  invitationRemindersAttempted: number;
  invitationRemindersSent: number;
  invitationRemindersSkipped: number;
  invitationRemindersFailed: number;
  errors: number;
}

function maxDate(left: Date, right: Date): Date {
  return left.getTime() >= right.getTime() ? left : right;
}

function minDate(left: Date, right: Date): Date {
  return left.getTime() <= right.getTime() ? left : right;
}

function isJsonObject(value: Prisma.JsonValue | null): value is Prisma.JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readString(value: Record<string, unknown>, key: string): string | null {
  const candidate = value[key];
  return typeof candidate === "string" && candidate.trim()
    ? candidate.trim()
    : null;
}

function buildAbsoluteUrl(appOrigin: string, path: string | null | undefined): string {
  const fallbackPath = "/account/notifications";
  const targetPath = typeof path === "string" && path.trim() ? path.trim() : fallbackPath;

  try {
    return new URL(targetPath, appOrigin).toString();
  } catch {
    return new URL(fallbackPath, appOrigin).toString();
  }
}

function buildProjectUrl(appOrigin: string, projectId: string): string {
  return buildAbsoluteUrl(appOrigin, `/projects/${encodeURIComponent(projectId)}`);
}

function normalizeAppOrigin(appOrigin: string | null | undefined): string {
  if (typeof appOrigin !== "string" || !appOrigin.trim()) {
    return "http://localhost:3000";
  }

  try {
    const parsed = new URL(appOrigin);
    if (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      parsed.origin !== "null"
    ) {
      return parsed.origin;
    }
  } catch {
    // Use the local fallback below.
  }

  return "http://localhost:3000";
}

function createSourceKey(notificationIds: string[]): string {
  return crypto
    .createHash("sha256")
    .update(notificationIds.slice().sort().join("\n"))
    .digest("hex");
}

function isUniqueConstraintFailure(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function mapDeliveryStatus(result: Awaited<ReturnType<typeof sendOutboundEmail>>) {
  if (!result.ok) {
    return {
      status: "failed" as const,
      deliveryId: result.deliveryId,
      errorCode: result.error,
    };
  }

  return {
    status: result.delivery,
    deliveryId: result.deliveryId,
    errorCode: null,
  };
}

function getDigestCandidate(notification: NotificationRecord): DigestCandidate | null {
  if (!isJsonObject(notification.metadata)) {
    return null;
  }

  const projectId = readString(notification.metadata, "projectId");
  const projectName = readString(notification.metadata, "projectName");
  const taskId = readString(notification.metadata, "taskId");
  const taskTitle = readString(notification.metadata, "taskTitle");
  const targetPath = readString(notification.metadata, "targetPath");

  if (!projectId || !projectName || !taskId || !taskTitle || !targetPath) {
    return null;
  }

  if (notification.type === NOTIFICATION_TYPE_TASK_COMMENT_MENTION) {
    const actorDisplayName = readString(notification.metadata, "authorDisplayName");
    if (!actorDisplayName) {
      return null;
    }

    return {
      notification,
      projectId,
      projectName,
      taskId,
      taskTitle,
      actorDisplayName,
      targetPath,
      activityKind: "mention",
      activityAt: maxDate(notification.createdAt, notification.updatedAt),
    };
  }

  if (notification.type === NOTIFICATION_TYPE_TASK_ASSIGNMENT) {
    const actorDisplayName = readString(notification.metadata, "actorDisplayName");
    if (!actorDisplayName) {
      return null;
    }

    return {
      notification,
      projectId,
      projectName,
      taskId,
      taskTitle,
      actorDisplayName,
      targetPath,
      activityKind: "assignment",
      activityAt: maxDate(notification.createdAt, notification.updatedAt),
    };
  }

  return null;
}

function getInvitationReminderCandidate(input: {
  recipient: VerifiedRecipient;
  notification: NotificationRecord;
  invitation: {
    id: string;
    invitedEmail: string;
    role: "editor" | "viewer";
    expiresAt: Date;
    acceptedAt: Date | null;
    revokedAt: Date | null;
    replacedAt: Date | null;
    project: {
      id: string;
      name: string;
    };
    invitedByUser: {
      email: string | null;
      name: string | null;
      username: string | null;
      usernameDiscriminator: string | null;
    };
  };
  now: Date;
}): InvitationReminderCandidate | null {
  if (
    input.invitation.acceptedAt ||
    input.invitation.revokedAt ||
    input.invitation.replacedAt ||
    input.invitation.expiresAt <= input.now ||
    input.invitation.invitedEmail.toLowerCase() !==
      input.recipient.email.toLowerCase()
  ) {
    return null;
  }

  const metadata = isJsonObject(input.notification.metadata)
    ? input.notification.metadata
    : null;
  const targetPath =
    metadata ? readString(metadata, "inviteLinkPath") : null;
  const displayName =
    input.invitation.invitedByUser.username &&
    input.invitation.invitedByUser.usernameDiscriminator
      ? `${input.invitation.invitedByUser.username}#${input.invitation.invitedByUser.usernameDiscriminator}`
      : input.invitation.invitedByUser.name ||
        input.invitation.invitedByUser.email ||
        "Someone";

  return {
    recipient: input.recipient,
    notification: input.notification,
    invitationId: input.invitation.id,
    projectId: input.invitation.project.id,
    projectName: input.invitation.project.name,
    invitedByDisplayName: displayName,
    role: input.invitation.role,
    expiresAt: input.invitation.expiresAt,
    targetPath:
      targetPath ?? `/invite/project/${encodeURIComponent(input.invitation.id)}`,
    createdAt: input.notification.createdAt,
  };
}

function summarizeDigestGroup(
  group: DigestGroup,
  appOrigin: string
): {
  items: ProjectNotificationDigestEmailItem[];
  omittedCount: number;
} {
  const collapsed = new Map<
    string,
    {
      label: string;
      count: number;
      targetPath: string;
    }
  >();

  for (const candidate of group.candidates) {
    const key = [
      candidate.activityKind,
      candidate.taskId,
      candidate.actorDisplayName,
    ].join(":");
    const existing = collapsed.get(key);

    if (existing) {
      existing.count += 1;
      continue;
    }

    const label =
      candidate.activityKind === "mention"
        ? `${candidate.actorDisplayName} mentioned you on ${candidate.taskTitle}`
        : `${candidate.actorDisplayName} assigned you to ${candidate.taskTitle}`;

    collapsed.set(key, {
      label,
      count: 1,
      targetPath: candidate.targetPath,
    });
  }

  const allItems = Array.from(collapsed.values()).map((item) => ({
    label: item.label,
    count: item.count,
    targetUrl: buildAbsoluteUrl(appOrigin, item.targetPath),
  }));

  return {
    items: allItems.slice(0, MAX_DIGEST_BODY_ITEMS),
    omittedCount: Math.max(0, allItems.length - MAX_DIGEST_BODY_ITEMS),
  };
}

async function findVerifiedRecipients(): Promise<VerifiedRecipient[]> {
  const users = await prisma.user.findMany({
    where: {
      email: {
        not: null,
      },
      emailVerified: {
        not: null,
      },
    },
    orderBy: [{ createdAt: "asc" }],
    select: {
      id: true,
      email: true,
      name: true,
    },
  });

  return users
    .filter((user): user is VerifiedRecipient => Boolean(user.email))
    .map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
    }));
}

async function getAlreadyCoveredNotificationIds(
  db: DbClient,
  notificationIds: string[],
  kind: typeof EMAIL_KIND_PROJECT_DIGEST | typeof EMAIL_KIND_PROJECT_INVITATION_REMINDER,
  now: Date
): Promise<Set<string>> {
  if (notificationIds.length === 0) {
    return new Set();
  }

  const pendingRetryThreshold = new Date(now.getTime() - PENDING_RETRY_GRACE_MS);
  const rows = await db.projectNotificationEmailItem.findMany({
    where: {
      notificationId: {
        in: notificationIds,
      },
      email: {
        kind,
        OR: [
          {
            status: {
              in: ["sent", "skipped"],
            },
          },
          {
            status: "pending",
            createdAt: {
              gte: pendingRetryThreshold,
            },
          },
        ],
      },
    },
    select: {
      notificationId: true,
    },
  });

  return new Set(rows.map((row) => row.notificationId));
}

async function collectDigestGroupsForRecipient(input: {
  recipient: VerifiedRecipient;
  now: Date;
}): Promise<DigestGroup[]> {
  return withActorRlsContext(input.recipient.id, async (db) => {
    const notifications = await db.notification.findMany({
      where: {
        recipientUserId: input.recipient.id,
        readAt: null,
        resolvedAt: null,
        type: {
          in: [
            NOTIFICATION_TYPE_TASK_COMMENT_MENTION,
            NOTIFICATION_TYPE_TASK_ASSIGNMENT,
          ],
        },
      },
      orderBy: [{ createdAt: "asc" }],
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        targetPath: true,
        sourceType: true,
        sourceId: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const coveredIds = await getAlreadyCoveredNotificationIds(
      db,
      notifications.map((notification) => notification.id),
      EMAIL_KIND_PROJECT_DIGEST,
      input.now
    );
    const candidates = notifications
      .filter((notification) => !coveredIds.has(notification.id))
      .map(getDigestCandidate)
      .filter((candidate): candidate is DigestCandidate => Boolean(candidate));

    const groupsByProject = new Map<string, DigestGroup>();
    for (const candidate of candidates) {
      const existing = groupsByProject.get(candidate.projectId);
      if (!existing) {
        groupsByProject.set(candidate.projectId, {
          recipient: input.recipient,
          projectId: candidate.projectId,
          projectName: candidate.projectName,
          candidates: [candidate],
          windowStartedAt: candidate.activityAt,
          windowEndedAt: candidate.activityAt,
          latestNotificationAt: candidate.activityAt,
        });
        continue;
      }

      existing.candidates.push(candidate);
      existing.windowStartedAt = minDate(
        existing.windowStartedAt,
        candidate.activityAt
      );
      existing.windowEndedAt = maxDate(existing.windowEndedAt, candidate.activityAt);
      existing.latestNotificationAt = maxDate(
        existing.latestNotificationAt,
        candidate.activityAt
      );
    }

    const quietThreshold = new Date(input.now.getTime() - QUIET_WINDOW_MS);
    return Array.from(groupsByProject.values()).filter(
      (group) => group.latestNotificationAt <= quietThreshold
    );
  });
}

async function collectInvitationRemindersForRecipient(input: {
  recipient: VerifiedRecipient;
  now: Date;
}): Promise<InvitationReminderCandidate[]> {
  return withActorRlsContext(input.recipient.id, async (db) => {
    const reminderThreshold = new Date(
      input.now.getTime() - INVITATION_REMINDER_AFTER_MS
    );
    const notifications = await db.notification.findMany({
      where: {
        recipientUserId: input.recipient.id,
        type: NOTIFICATION_TYPE_PROJECT_INVITATION,
        readAt: null,
        resolvedAt: null,
        createdAt: {
          lte: reminderThreshold,
        },
      },
      orderBy: [{ createdAt: "asc" }],
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        targetPath: true,
        sourceType: true,
        sourceId: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const coveredIds = await getAlreadyCoveredNotificationIds(
      db,
      notifications.map((notification) => notification.id),
      EMAIL_KIND_PROJECT_INVITATION_REMINDER,
      input.now
    );
    const candidates: InvitationReminderCandidate[] = [];
    const notificationsByInvitationId = new Map(
      notifications
        .filter((notification) => !coveredIds.has(notification.id))
        .map((notification) => [notification.sourceId, notification])
    );

    if (notificationsByInvitationId.size === 0) {
      return candidates;
    }

    const invitations = await db.projectInvitation.findMany({
      where: {
        id: {
          in: Array.from(notificationsByInvitationId.keys()),
        },
      },
      select: {
        id: true,
        invitedEmail: true,
        role: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
        replacedAt: true,
        project: {
          select: {
            id: true,
            name: true,
          },
        },
        invitedByUser: {
          select: {
            email: true,
            name: true,
            username: true,
            usernameDiscriminator: true,
          },
        },
      },
    });

    for (const invitation of invitations) {
      const notification = notificationsByInvitationId.get(invitation.id);
      if (!notification) {
        continue;
      }

      const invitationRole = invitation.role;
      if (invitationRole !== "editor" && invitationRole !== "viewer") {
        continue;
      }

      const candidate = getInvitationReminderCandidate({
        recipient: input.recipient,
        notification,
        invitation: {
          ...invitation,
          role: invitationRole,
        },
        now: input.now,
      });

      if (candidate) {
        candidates.push(candidate);
      }
    }

    return candidates;
  });
}

async function hasRecentProjectEmail(input: {
  kind: typeof EMAIL_KIND_PROJECT_DIGEST | typeof EMAIL_KIND_PROJECT_INVITATION_REMINDER;
  recipientUserId: string;
  projectId: string;
  since: Date;
}): Promise<boolean> {
  const existing = await prisma.projectNotificationEmail.findFirst({
    where: {
      kind: input.kind,
      recipientUserId: input.recipientUserId,
      projectId: input.projectId,
      createdAt: {
        gte: input.since,
      },
    },
    select: {
      id: true,
    },
  });

  return Boolean(existing);
}

async function findRetryableEmailRecord(input: {
  kind: typeof EMAIL_KIND_PROJECT_DIGEST | typeof EMAIL_KIND_PROJECT_INVITATION_REMINDER;
  recipientUserId: string;
  projectId: string;
  sourceKey: string;
  now: Date;
}): Promise<{ id: string } | null> {
  const pendingRetryThreshold = new Date(
    input.now.getTime() - PENDING_RETRY_GRACE_MS
  );

  return prisma.projectNotificationEmail.findFirst({
    where: {
      kind: input.kind,
      recipientUserId: input.recipientUserId,
      projectId: input.projectId,
      sourceKey: input.sourceKey,
      OR: [
        {
          status: "failed",
        },
        {
          status: "pending",
          createdAt: {
            lt: pendingRetryThreshold,
          },
        },
      ],
    },
    select: {
      id: true,
    },
  });
}

async function markEmailAttemptStarted(id: string): Promise<void> {
  await prisma.projectNotificationEmail.update({
    where: { id },
    data: {
      status: "pending",
      outboundEmailDeliveryId: null,
      errorCode: null,
      completedAt: null,
    },
  });
}

async function markEmailComplete(input: {
  id: string;
  result: Awaited<ReturnType<typeof sendOutboundEmail>>;
}): Promise<"sent" | "skipped" | "failed"> {
  const mapped = mapDeliveryStatus(input.result);

  await prisma.projectNotificationEmail.update({
    where: { id: input.id },
    data: {
      status: mapped.status,
      outboundEmailDeliveryId: mapped.deliveryId,
      errorCode: mapped.errorCode,
      completedAt: new Date(),
    },
  });

  return mapped.status;
}

async function sendDigestGroup(input: {
  group: DigestGroup;
  appOrigin: string;
  now: Date;
}): Promise<"sent" | "skipped" | "failed" | "duplicate" | "rate-limited"> {
  const notificationIds = input.group.candidates.map(
    (candidate) => candidate.notification.id
  );
  const sourceKey = createSourceKey(notificationIds);
  const recentThreshold = new Date(input.now.getTime() - QUIET_WINDOW_MS);

  if (
    await hasRecentProjectEmail({
      kind: EMAIL_KIND_PROJECT_DIGEST,
      recipientUserId: input.group.recipient.id,
      projectId: input.group.projectId,
      since: recentThreshold,
    })
  ) {
    return "rate-limited";
  }

  let emailRecord: { id: string } | null = await findRetryableEmailRecord({
    kind: EMAIL_KIND_PROJECT_DIGEST,
    recipientUserId: input.group.recipient.id,
    projectId: input.group.projectId,
    sourceKey,
    now: input.now,
  });

  try {
    if (emailRecord) {
      await markEmailAttemptStarted(emailRecord.id);
    } else {
      emailRecord = await prisma.projectNotificationEmail.create({
        data: {
          kind: EMAIL_KIND_PROJECT_DIGEST,
          recipientUserId: input.group.recipient.id,
          projectId: input.group.projectId,
          sourceKey,
          windowStartedAt: input.group.windowStartedAt,
          windowEndedAt: input.group.windowEndedAt,
          latestNotificationAt: input.group.latestNotificationAt,
          notificationCount: input.group.candidates.length,
          status: "pending",
          metadata: {
            notificationIds,
            quietWindowMinutes: QUIET_WINDOW_MS / 60_000,
          },
          items: {
            create: notificationIds.map((notificationId) => ({
              notificationId,
            })),
          },
        },
        select: {
          id: true,
        },
      });
    }
  } catch (error) {
    if (isUniqueConstraintFailure(error)) {
      return "duplicate";
    }
    throw error;
  }

  const summary = summarizeDigestGroup(input.group, input.appOrigin);
  const message = buildProjectNotificationDigestEmail({
    projectName: input.group.projectName,
    notificationCount: input.group.candidates.length,
    items: summary.items,
    omittedCount: summary.omittedCount,
    projectUrl: buildProjectUrl(input.appOrigin, input.group.projectId),
    notificationsUrl: buildAbsoluteUrl(input.appOrigin, "/account/notifications"),
  });

  const result = await sendOutboundEmail({
    templateKey: "project_notification_digest",
    to: input.group.recipient.email,
    subject: message.subject,
    text: message.text,
    html: message.html,
    metadata: {
      projectId: input.group.projectId,
      recipientUserId: input.group.recipient.id,
      notificationIds,
      notificationCount: input.group.candidates.length,
      windowStartedAt: input.group.windowStartedAt.toISOString(),
      windowEndedAt: input.group.windowEndedAt.toISOString(),
    },
  });

  return markEmailComplete({
    id: emailRecord.id,
    result,
  });
}

async function sendInvitationReminder(input: {
  candidate: InvitationReminderCandidate;
  appOrigin: string;
  now: Date;
}): Promise<"sent" | "skipped" | "failed" | "duplicate" | "rate-limited"> {
  const recentThreshold = new Date(input.now.getTime() - QUIET_WINDOW_MS);
  if (
    await hasRecentProjectEmail({
      kind: EMAIL_KIND_PROJECT_INVITATION_REMINDER,
      recipientUserId: input.candidate.recipient.id,
      projectId: input.candidate.projectId,
      since: recentThreshold,
    })
  ) {
    return "rate-limited";
  }

  let emailRecord: { id: string } | null = await findRetryableEmailRecord({
    kind: EMAIL_KIND_PROJECT_INVITATION_REMINDER,
    recipientUserId: input.candidate.recipient.id,
    projectId: input.candidate.projectId,
    sourceKey: input.candidate.invitationId,
    now: input.now,
  });

  try {
    if (emailRecord) {
      await markEmailAttemptStarted(emailRecord.id);
    } else {
      emailRecord = await prisma.projectNotificationEmail.create({
        data: {
          kind: EMAIL_KIND_PROJECT_INVITATION_REMINDER,
          recipientUserId: input.candidate.recipient.id,
          projectId: input.candidate.projectId,
          sourceKey: input.candidate.invitationId,
          windowStartedAt: input.candidate.createdAt,
          windowEndedAt: input.candidate.createdAt,
          latestNotificationAt: input.candidate.createdAt,
          notificationCount: 1,
          status: "pending",
          metadata: {
            invitationId: input.candidate.invitationId,
            reminderAfterHours: INVITATION_REMINDER_AFTER_MS / 3_600_000,
          },
          items: {
            create: [
              {
                notificationId: input.candidate.notification.id,
              },
            ],
          },
        },
        select: {
          id: true,
        },
      });
    }
  } catch (error) {
    if (isUniqueConstraintFailure(error)) {
      return "duplicate";
    }
    throw error;
  }

  const inviteUrl = buildAbsoluteUrl(input.appOrigin, input.candidate.targetPath);
  const message = buildProjectInvitationEmail({
    inviteUrl,
    projectName: input.candidate.projectName,
    invitedByDisplayName: input.candidate.invitedByDisplayName,
    role: input.candidate.role,
    expiresAt: input.candidate.expiresAt,
    variant: "reminder",
  });

  const result = await sendOutboundEmail({
    templateKey: "project_invitation",
    to: input.candidate.recipient.email,
    subject: message.subject,
    text: message.text,
    html: message.html,
    metadata: {
      invitationId: input.candidate.invitationId,
      projectId: input.candidate.projectId,
      recipientUserId: input.candidate.recipient.id,
      deliveryReason: "six_hour_invitation_reminder",
    },
  });

  return markEmailComplete({
    id: emailRecord.id,
    result,
  });
}

function applyOutcome(
  summary: DispatchProjectNotificationEmailsSummary,
  kind: "digest" | "invitation-reminder",
  outcome: "sent" | "skipped" | "failed" | "duplicate" | "rate-limited"
) {
  if (kind === "digest") {
    if (outcome === "sent") {
      summary.digestsSent += 1;
    } else if (outcome === "failed") {
      summary.digestsFailed += 1;
    } else {
      summary.digestsSkipped += 1;
    }
    return;
  }

  if (outcome === "sent") {
    summary.invitationRemindersSent += 1;
  } else if (outcome === "failed") {
    summary.invitationRemindersFailed += 1;
  } else {
    summary.invitationRemindersSkipped += 1;
  }
}

export async function dispatchProjectNotificationEmails(input: {
  appOrigin?: string | null;
  now?: Date;
} = {}): Promise<DispatchProjectNotificationEmailsSummary> {
  const appOrigin = normalizeAppOrigin(input.appOrigin);
  const now = input.now ?? new Date();
  const summary: DispatchProjectNotificationEmailsSummary = {
    usersScanned: 0,
    digestsAttempted: 0,
    digestsSent: 0,
    digestsSkipped: 0,
    digestsFailed: 0,
    invitationRemindersAttempted: 0,
    invitationRemindersSent: 0,
    invitationRemindersSkipped: 0,
    invitationRemindersFailed: 0,
    errors: 0,
  };

  const recipients = await findVerifiedRecipients();
  let groupAttempts = 0;

  for (const recipient of recipients) {
    summary.usersScanned += 1;

    try {
      const digestGroups = await collectDigestGroupsForRecipient({
        recipient,
        now,
      });

      for (const group of digestGroups) {
        if (groupAttempts >= MAX_GROUPS_PER_DISPATCH) {
          break;
        }

        groupAttempts += 1;
        summary.digestsAttempted += 1;
        const outcome = await sendDigestGroup({
          group,
          appOrigin,
          now,
        });
        applyOutcome(summary, "digest", outcome);
      }

      const invitationReminders = await collectInvitationRemindersForRecipient({
        recipient,
        now,
      });

      for (const candidate of invitationReminders) {
        if (groupAttempts >= MAX_GROUPS_PER_DISPATCH) {
          break;
        }

        groupAttempts += 1;
        summary.invitationRemindersAttempted += 1;
        const outcome = await sendInvitationReminder({
          candidate,
          appOrigin,
          now,
        });
        applyOutcome(summary, "invitation-reminder", outcome);
      }
    } catch (error) {
      summary.errors += 1;
      logServerError("dispatchProjectNotificationEmails.recipient", error, {
        recipientUserId: recipient.id,
      });
    }
  }

  logServerInfo(
    "dispatchProjectNotificationEmails",
    "Project notification email dispatch completed.",
    { ...summary }
  );

  return summary;
}
