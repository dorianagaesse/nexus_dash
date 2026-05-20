import crypto from "node:crypto";

import { Prisma } from "@prisma/client";

import { logServerError, logServerInfo } from "@/lib/observability/logger";
import { prisma } from "@/lib/prisma";
import { sendOutboundEmail } from "@/lib/services/outbound-email-service";
import {
  buildProjectNotificationDigestEmail,
  type ProjectNotificationDigestEmailItem,
  type ProjectNotificationDigestEmailSection,
} from "@/lib/services/outbound-email-templates";
import { type DbClient, withActorRlsContext } from "@/lib/services/rls-context";

const NOTIFICATION_TYPE_PROJECT_INVITATION = "project_invitation";
const NOTIFICATION_TYPE_TASK_COMMENT_MENTION = "task_comment_mention";
const NOTIFICATION_TYPE_TASK_ASSIGNMENT = "task_assignment";
const EMAIL_KIND_PROJECT_DIGEST = "project_digest";
const EMAIL_KIND_PROJECT_INVITATION_REMINDER = "project_invitation_reminder";

const QUIET_WINDOW_MS = 30 * 60 * 1000;
const MAX_ACTIVITY_DELAY_MS = 60 * 60 * 1000;
const INVITATION_REMINDER_AFTER_MS = 6 * 60 * 60 * 1000;
const STALE_DISPATCHING_MS = 30 * 60 * 1000;
const MAX_GROUPS_PER_DISPATCH = 100;
const MAX_RECONCILE_NOTIFICATIONS = 500;
const MAX_DIGEST_BODY_ITEMS_PER_PROJECT = 12;

type NotificationEmailKind =
  | typeof EMAIL_KIND_PROJECT_DIGEST
  | typeof EMAIL_KIND_PROJECT_INVITATION_REMINDER;

type NotificationEmailStatus = "sent" | "skipped" | "failed";

interface VerifiedRecipient {
  id: string;
  email: string | null;
  emailVerified: Date | null;
  name: string | null;
}

interface NotificationRecord {
  id: string;
  recipientUserId: string;
  type: string;
  title: string;
  body: string | null;
  targetPath: string | null;
  sourceType: string;
  sourceId: string;
  metadata: Prisma.JsonValue | null;
  readAt: Date | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface QueueDetails {
  kind: NotificationEmailKind;
  projectId: string;
  projectName: string;
  sourceKey: string;
  groupingKey: string;
  firstPendingNotificationAt: Date;
  latestPendingNotificationAt: Date;
  sendAfterAt: Date;
  maxSendAt: Date;
  sourceFingerprint: string;
  metadata: Prisma.InputJsonObject;
}

interface ClaimedNotificationItem {
  id: string;
  notificationId: string;
  notificationUpdatedAt: Date | null;
  sourceFingerprint: string | null;
  notification: NotificationRecord;
}

interface ClaimedEmailGroup {
  id: string;
  kind: NotificationEmailKind;
  recipientUserId: string;
  projectId: string;
  sourceKey: string;
  groupingKey: string;
  firstPendingNotificationAt: Date;
  latestPendingNotificationAt: Date;
  sendAfterAt: Date;
  maxSendAt: Date;
  windowStartedAt: Date;
  windowEndedAt: Date;
  latestNotificationAt: Date;
  notificationCount: number;
  recipient: VerifiedRecipient;
  project: {
    id: string;
    name: string;
  };
  items: ClaimedNotificationItem[];
}

interface PreparedSection {
  groupId: string;
  projectId: string;
  section: ProjectNotificationDigestEmailSection;
  notificationIds: string[];
}

export interface DispatchProjectNotificationEmailsSummary {
  notificationsReconciled: number;
  groupsClaimed: number;
  recipientEmailsAttempted: number;
  recipientEmailsSent: number;
  recipientEmailsSkipped: number;
  recipientEmailsFailed: number;
  groupsSent: number;
  groupsSkipped: number;
  groupsFailed: number;
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

function createClaimToken(): string {
  return crypto.randomBytes(16).toString("hex");
}

function createSourceFingerprint(notification: {
  id: string;
  updatedAt: Date;
}): string {
  return `${notification.id}:${notification.updatedAt.toISOString()}`;
}

function createSourceKeyFromFingerprint(sourceFingerprint: string): string {
  return crypto.createHash("sha256").update(sourceFingerprint).digest("hex");
}

function mapDeliveryStatus(
  result: Awaited<ReturnType<typeof sendOutboundEmail>>
): {
  status: NotificationEmailStatus;
  deliveryId: string | null;
  errorCode: string | null;
} {
  if (!result.ok) {
    return {
      status: "failed",
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

function calculateActivitySchedule(input: {
  firstPendingNotificationAt: Date;
  latestPendingNotificationAt: Date;
}) {
  const quietSendAfterAt = new Date(
    input.latestPendingNotificationAt.getTime() + QUIET_WINDOW_MS
  );
  const maxSendAt = new Date(
    input.firstPendingNotificationAt.getTime() + MAX_ACTIVITY_DELAY_MS
  );

  return {
    sendAfterAt: minDate(quietSendAfterAt, maxSendAt),
    maxSendAt,
  };
}

function createActivityGroupingKey(input: {
  recipientUserId: string;
  projectId: string;
}): string {
  return [
    EMAIL_KIND_PROJECT_DIGEST,
    input.recipientUserId,
    input.projectId,
  ].join(":");
}

function createInvitationGroupingKey(input: {
  recipientUserId: string;
  projectId: string;
  invitationId: string;
}): string {
  return [
    EMAIL_KIND_PROJECT_INVITATION_REMINDER,
    input.recipientUserId,
    input.projectId,
    input.invitationId,
  ].join(":");
}

function getQueueDetails(notification: NotificationRecord): QueueDetails | null {
  if (!isJsonObject(notification.metadata)) {
    return null;
  }

  const projectId = readString(notification.metadata, "projectId");
  const projectName = readString(notification.metadata, "projectName");
  if (!projectId || !projectName) {
    return null;
  }

  const sourceFingerprint = createSourceFingerprint(notification);
  const activityAt = maxDate(notification.createdAt, notification.updatedAt);

  if (
    notification.type === NOTIFICATION_TYPE_TASK_COMMENT_MENTION ||
    notification.type === NOTIFICATION_TYPE_TASK_ASSIGNMENT
  ) {
    const schedule = calculateActivitySchedule({
      firstPendingNotificationAt: activityAt,
      latestPendingNotificationAt: activityAt,
    });

    return {
      kind: EMAIL_KIND_PROJECT_DIGEST,
      projectId,
      projectName,
      sourceKey: createSourceKeyFromFingerprint(sourceFingerprint),
      groupingKey: createActivityGroupingKey({
        recipientUserId: notification.recipientUserId,
        projectId,
      }),
      firstPendingNotificationAt: activityAt,
      latestPendingNotificationAt: activityAt,
      sendAfterAt: schedule.sendAfterAt,
      maxSendAt: schedule.maxSendAt,
      sourceFingerprint,
      metadata: {
        projectId,
        projectName,
        quietWindowMinutes: QUIET_WINDOW_MS / 60_000,
        maxDelayMinutes: MAX_ACTIVITY_DELAY_MS / 60_000,
      },
    };
  }

  if (notification.type === NOTIFICATION_TYPE_PROJECT_INVITATION) {
    const invitationId = readString(notification.metadata, "invitationId");
    if (!invitationId) {
      return null;
    }

    const sendAfterAt = new Date(
      notification.createdAt.getTime() + INVITATION_REMINDER_AFTER_MS
    );

    return {
      kind: EMAIL_KIND_PROJECT_INVITATION_REMINDER,
      projectId,
      projectName,
      sourceKey: invitationId,
      groupingKey: createInvitationGroupingKey({
        recipientUserId: notification.recipientUserId,
        projectId,
        invitationId,
      }),
      firstPendingNotificationAt: notification.createdAt,
      latestPendingNotificationAt: notification.createdAt,
      sendAfterAt,
      maxSendAt: sendAfterAt,
      sourceFingerprint,
      metadata: {
        invitationId,
        projectId,
        projectName,
        reminderAfterHours: INVITATION_REMINDER_AFTER_MS / 3_600_000,
      },
    };
  }

  return null;
}

async function isRecipientVerified(db: DbClient, recipientUserId: string) {
  const recipient = await db.user.findUnique({
    where: { id: recipientUserId },
    select: {
      email: true,
      emailVerified: true,
    },
  });

  return Boolean(recipient?.email && recipient.emailVerified);
}

async function isNotificationFingerprintCovered(input: {
  db: DbClient;
  notificationId: string;
  notificationUpdatedAt: Date;
  sourceFingerprint: string;
  kind: NotificationEmailKind;
}): Promise<boolean> {
  const existing = await input.db.projectNotificationEmailItem.findFirst({
    where: {
      notificationId: input.notificationId,
      email: {
        kind: input.kind,
      },
      OR: [
        {
          email: {
            kind: input.kind,
            status: {
              in: ["sent"],
            },
          },
        },
        {
          OR: [
            {
              notificationUpdatedAt: input.notificationUpdatedAt,
            },
            {
              sourceFingerprint: input.sourceFingerprint,
            },
          ],
          email: {
            kind: input.kind,
            status: {
              in: ["pending", "dispatching"],
            },
          },
        },
      ],
    },
    select: {
      id: true,
    },
  });

  return Boolean(existing);
}

async function countGroupItems(db: DbClient, emailId: string): Promise<number> {
  return db.projectNotificationEmailItem.count({
    where: {
      emailId,
    },
  });
}

async function attachNotificationToGroup(input: {
  db: DbClient;
  emailId: string;
  notification: NotificationRecord;
  sourceFingerprint: string;
}) {
  const existingItem = await input.db.projectNotificationEmailItem.findFirst({
    where: {
      emailId: input.emailId,
      notificationId: input.notification.id,
    },
    select: {
      id: true,
    },
  });

  if (existingItem) {
    await input.db.projectNotificationEmailItem.update({
      where: {
        id: existingItem.id,
      },
      data: {
        notificationUpdatedAt: input.notification.updatedAt,
        sourceFingerprint: input.sourceFingerprint,
      },
    });
    return;
  }

  await input.db.projectNotificationEmailItem.create({
    data: {
      emailId: input.emailId,
      notificationId: input.notification.id,
      notificationUpdatedAt: input.notification.updatedAt,
      sourceFingerprint: input.sourceFingerprint,
    },
  });
}

export async function enqueueNotificationEmailForNotification(input: {
  db: DbClient;
  notification: NotificationRecord;
}): Promise<void> {
  if (input.notification.readAt || input.notification.resolvedAt) {
    return;
  }

  const details = getQueueDetails(input.notification);
  if (!details) {
    return;
  }

  if (!(await isRecipientVerified(input.db, input.notification.recipientUserId))) {
    return;
  }

  if (
    await isNotificationFingerprintCovered({
      db: input.db,
      notificationId: input.notification.id,
      notificationUpdatedAt: input.notification.updatedAt,
      sourceFingerprint: details.sourceFingerprint,
      kind: details.kind,
    })
  ) {
    return;
  }

  const pendingGroup = await input.db.projectNotificationEmail.findFirst({
    where: {
      groupingKey: details.groupingKey,
      status: "pending",
    },
    select: {
      id: true,
      firstPendingNotificationAt: true,
      latestPendingNotificationAt: true,
    },
  });

  if (!pendingGroup) {
    try {
      await input.db.projectNotificationEmail.create({
        data: {
          kind: details.kind,
          recipientUserId: input.notification.recipientUserId,
          projectId: details.projectId,
          sourceKey: details.sourceKey,
          groupingKey: details.groupingKey,
          firstPendingNotificationAt: details.firstPendingNotificationAt,
          latestPendingNotificationAt: details.latestPendingNotificationAt,
          sendAfterAt: details.sendAfterAt,
          maxSendAt: details.maxSendAt,
          windowStartedAt: details.firstPendingNotificationAt,
          windowEndedAt: details.latestPendingNotificationAt,
          latestNotificationAt: details.latestPendingNotificationAt,
          notificationCount: 1,
          status: "pending",
          metadata: details.metadata,
          items: {
            create: [
              {
                notificationId: input.notification.id,
                notificationUpdatedAt: input.notification.updatedAt,
                sourceFingerprint: details.sourceFingerprint,
              },
            ],
          },
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return;
      }
      throw error;
    }
    return;
  }

  await attachNotificationToGroup({
    db: input.db,
    emailId: pendingGroup.id,
    notification: input.notification,
    sourceFingerprint: details.sourceFingerprint,
  });

  const firstPendingNotificationAt = minDate(
    pendingGroup.firstPendingNotificationAt,
    details.firstPendingNotificationAt
  );
  const latestPendingNotificationAt = maxDate(
    pendingGroup.latestPendingNotificationAt,
    details.latestPendingNotificationAt
  );
  const schedule =
    details.kind === EMAIL_KIND_PROJECT_DIGEST
      ? calculateActivitySchedule({
          firstPendingNotificationAt,
          latestPendingNotificationAt,
        })
      : {
          sendAfterAt: details.sendAfterAt,
          maxSendAt: details.maxSendAt,
        };

  await input.db.projectNotificationEmail.update({
    where: {
      id: pendingGroup.id,
    },
    data: {
      firstPendingNotificationAt,
      latestPendingNotificationAt,
      sendAfterAt: schedule.sendAfterAt,
      maxSendAt: schedule.maxSendAt,
      windowStartedAt: firstPendingNotificationAt,
      windowEndedAt: latestPendingNotificationAt,
      latestNotificationAt: latestPendingNotificationAt,
      notificationCount: await countGroupItems(input.db, pendingGroup.id),
      metadata: details.metadata,
    },
  });
}

async function findUncoveredNotificationEmailCandidates(
  limit: number
): Promise<NotificationRecord[]> {
  return prisma.$queryRaw<NotificationRecord[]>(Prisma.sql`
    SELECT
      notification."id",
      notification."recipientUserId",
      notification."type",
      notification."title",
      notification."body",
      notification."targetPath",
      notification."sourceType",
      notification."sourceId",
      notification."metadata",
      notification."readAt",
      notification."resolvedAt",
      notification."createdAt",
      notification."updatedAt"
    FROM "Notification" notification
    INNER JOIN "User" recipient
      ON recipient."id" = notification."recipientUserId"
    WHERE notification."readAt" IS NULL
      AND notification."resolvedAt" IS NULL
      AND notification."type" IN (
        ${NOTIFICATION_TYPE_PROJECT_INVITATION},
        ${NOTIFICATION_TYPE_TASK_COMMENT_MENTION},
        ${NOTIFICATION_TYPE_TASK_ASSIGNMENT}
      )
      AND recipient."email" IS NOT NULL
      AND recipient."emailVerified" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM "ProjectNotificationEmailItem" item
        INNER JOIN "ProjectNotificationEmail" email
          ON email."id" = item."emailId"
        WHERE item."notificationId" = notification."id"
          AND (
            email."status" = 'sent'
            OR (
              email."status" IN ('pending', 'dispatching')
              AND (
                item."notificationUpdatedAt" = notification."updatedAt"
                OR item."sourceFingerprint" =
                  notification."id" || ':' ||
                  to_char(notification."updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
              )
            )
          )
      )
    ORDER BY notification."updatedAt" ASC, notification."id" ASC
    LIMIT ${limit}
  `);
}

async function reconcilePendingNotificationEmailGroups(): Promise<number> {
  const notifications = await findUncoveredNotificationEmailCandidates(
    MAX_RECONCILE_NOTIFICATIONS
  );
  let reconciled = 0;

  for (const notification of notifications) {
    await withActorRlsContext(notification.recipientUserId, async (db) => {
      await enqueueNotificationEmailForNotification({
        db,
        notification,
      });
    });
    reconciled += 1;
  }

  return reconciled;
}

async function releaseStaleDispatchingGroups(now: Date): Promise<void> {
  const staleBefore = new Date(now.getTime() - STALE_DISPATCHING_MS);
  await prisma.projectNotificationEmail.updateMany({
    where: {
      status: "dispatching",
      claimedAt: {
        lt: staleBefore,
      },
    },
    data: {
      status: "pending",
      errorCode: "dispatch-claim-stale",
      claimToken: null,
      claimedAt: null,
      completedAt: null,
      sendAfterAt: now,
    },
  });
}

async function claimDueGroups(input: {
  now: Date;
  limit: number;
  claimToken: string;
}): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    WITH due AS (
      SELECT "id"
      FROM "ProjectNotificationEmail"
      WHERE "status" = 'pending'
        AND "sendAfterAt" <= ${input.now}
      ORDER BY "sendAfterAt" ASC, "createdAt" ASC
      LIMIT ${input.limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE "ProjectNotificationEmail" AS email
    SET
      "status" = 'dispatching',
      "claimToken" = ${input.claimToken},
      "claimedAt" = ${input.now},
      "attemptCount" = "attemptCount" + 1,
      "lastAttemptAt" = ${input.now},
      "updatedAt" = ${input.now}
    FROM due
    WHERE email."id" = due."id"
    RETURNING email."id"
  `);

  return rows.map((row) => row.id);
}

async function loadClaimedGroupsForRecipient(input: {
  recipientUserId: string;
  claimToken: string;
}): Promise<ClaimedEmailGroup[]> {
  return withActorRlsContext(input.recipientUserId, async (db) => {
    const groups = await db.projectNotificationEmail.findMany({
      where: {
        recipientUserId: input.recipientUserId,
        status: "dispatching",
        claimToken: input.claimToken,
      },
      orderBy: [{ sendAfterAt: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        kind: true,
        recipientUserId: true,
        projectId: true,
        sourceKey: true,
        groupingKey: true,
        firstPendingNotificationAt: true,
        latestPendingNotificationAt: true,
        sendAfterAt: true,
        maxSendAt: true,
        windowStartedAt: true,
        windowEndedAt: true,
        latestNotificationAt: true,
        notificationCount: true,
        recipient: {
          select: {
            id: true,
            email: true,
            emailVerified: true,
            name: true,
          },
        },
        project: {
          select: {
            id: true,
            name: true,
          },
        },
        items: {
          orderBy: [{ createdAt: "asc" }],
          select: {
            id: true,
            notificationId: true,
            notificationUpdatedAt: true,
            sourceFingerprint: true,
            notification: {
              select: {
                id: true,
                recipientUserId: true,
                type: true,
                title: true,
                body: true,
                targetPath: true,
                sourceType: true,
                sourceId: true,
                metadata: true,
                readAt: true,
                resolvedAt: true,
                createdAt: true,
                updatedAt: true,
              },
            },
          },
        },
      },
    });

    return groups;
  });
}

function buildActivityItems(input: {
  group: ClaimedEmailGroup;
  appOrigin: string;
}): PreparedSection | null {
  const collapsed = new Map<
    string,
    {
      label: string;
      count: number;
      targetPath: string;
    }
  >();
  const notificationIds: string[] = [];

  for (const item of input.group.items) {
    const notification = item.notification;
    if (
      notification.readAt ||
      notification.resolvedAt ||
      item.sourceFingerprint !== createSourceFingerprint(notification) ||
      !isJsonObject(notification.metadata)
    ) {
      continue;
    }

    const taskId = readString(notification.metadata, "taskId");
    const taskTitle = readString(notification.metadata, "taskTitle");
    const targetPath = readString(notification.metadata, "targetPath");
    if (!taskId || !taskTitle || !targetPath) {
      continue;
    }

    const actorDisplayName =
      notification.type === NOTIFICATION_TYPE_TASK_COMMENT_MENTION
        ? readString(notification.metadata, "authorDisplayName")
        : readString(notification.metadata, "actorDisplayName");
    if (!actorDisplayName) {
      continue;
    }

    const activityKind =
      notification.type === NOTIFICATION_TYPE_TASK_COMMENT_MENTION
        ? "mention"
        : "assignment";
    const key = [activityKind, taskId, actorDisplayName].join(":");
    const existing = collapsed.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      collapsed.set(key, {
        label:
          activityKind === "mention"
            ? `${actorDisplayName} mentioned you on ${taskTitle}`
            : `${actorDisplayName} assigned you to ${taskTitle}`,
        count: 1,
        targetPath,
      });
    }
    notificationIds.push(notification.id);
  }

  if (notificationIds.length === 0) {
    return null;
  }

  const allItems: ProjectNotificationDigestEmailItem[] = Array.from(
    collapsed.values()
  ).map((item) => ({
    label: item.label,
    count: item.count,
    targetUrl: buildAbsoluteUrl(input.appOrigin, item.targetPath),
  }));

  return {
    groupId: input.group.id,
    projectId: input.group.projectId,
    notificationIds,
    section: {
      projectName: input.group.project.name,
      projectUrl: buildProjectUrl(input.appOrigin, input.group.projectId),
      notificationCount: notificationIds.length,
      items: allItems.slice(0, MAX_DIGEST_BODY_ITEMS_PER_PROJECT),
      omittedCount: Math.max(
        0,
        allItems.length - MAX_DIGEST_BODY_ITEMS_PER_PROJECT
      ),
    },
  };
}

async function buildInvitationReminderItem(input: {
  group: ClaimedEmailGroup;
  appOrigin: string;
  now: Date;
}): Promise<PreparedSection | null> {
  const item = input.group.items[0];
  if (!item) {
    return null;
  }

  const notification = item.notification;
  if (
    notification.readAt ||
    notification.resolvedAt ||
    item.sourceFingerprint !== createSourceFingerprint(notification) ||
    !isJsonObject(notification.metadata)
  ) {
    return null;
  }

  const invitationId = readString(notification.metadata, "invitationId");
  const role = readString(notification.metadata, "role");
  const invitedByDisplayName = readString(
    notification.metadata,
    "invitedByDisplayName"
  );
  const inviteLinkPath = readString(notification.metadata, "inviteLinkPath");
  if (
    !invitationId ||
    (role !== "editor" && role !== "viewer") ||
    !invitedByDisplayName ||
    !inviteLinkPath
  ) {
    return null;
  }

  const invitation = await withActorRlsContext(
    input.group.recipientUserId,
    async (db) =>
      db.projectInvitation.findFirst({
        where: {
          id: invitationId,
          acceptedAt: null,
          revokedAt: null,
          replacedAt: null,
          expiresAt: {
            gt: input.now,
          },
        },
        select: {
          id: true,
        },
      })
  );

  if (!invitation) {
    return null;
  }

  return {
    groupId: input.group.id,
    projectId: input.group.projectId,
    notificationIds: [notification.id],
    section: {
      projectName: input.group.project.name,
      projectUrl: buildProjectUrl(input.appOrigin, input.group.projectId),
      notificationCount: 1,
      items: [
        {
          label: `Reminder: ${invitedByDisplayName} invited you to ${
            role === "viewer" ? "view" : "collaborate on"
          } ${input.group.project.name}`,
          count: 1,
          targetUrl: buildAbsoluteUrl(input.appOrigin, inviteLinkPath),
        },
      ],
      omittedCount: 0,
    },
  };
}

async function findSentCoveredNotificationIds(input: {
  kind: NotificationEmailKind;
  currentGroupId: string;
  notificationIds: string[];
}): Promise<Set<string>> {
  const notificationIds = Array.from(new Set(input.notificationIds));
  if (notificationIds.length === 0) {
    return new Set();
  }

  const rows = await prisma.projectNotificationEmailItem.findMany({
    where: {
      notificationId: {
        in: notificationIds,
      },
      emailId: {
        not: input.currentGroupId,
      },
      email: {
        kind: input.kind,
        status: "sent",
      },
    },
    select: {
      notificationId: true,
    },
  });

  return new Set(rows.map((row) => row.notificationId));
}

async function buildPreparedSection(input: {
  group: ClaimedEmailGroup;
  appOrigin: string;
  now: Date;
}): Promise<PreparedSection | null> {
  const sentCoveredNotificationIds = await findSentCoveredNotificationIds({
    kind: input.group.kind,
    currentGroupId: input.group.id,
    notificationIds: input.group.items.map((item) => item.notificationId),
  });

  if (sentCoveredNotificationIds.size > 0) {
    input.group = {
      ...input.group,
      items: input.group.items.filter(
        (item) => !sentCoveredNotificationIds.has(item.notificationId)
      ),
    };
  }

  if (input.group.kind === EMAIL_KIND_PROJECT_DIGEST) {
    return buildActivityItems({
      group: input.group,
      appOrigin: input.appOrigin,
    });
  }

  return buildInvitationReminderItem(input);
}

async function markGroupsComplete(input: {
  groupIds: string[];
  status: NotificationEmailStatus;
  now: Date;
  outboundEmailDeliveryId?: string | null;
  errorCode?: string | null;
}) {
  if (input.groupIds.length === 0) {
    return;
  }

  await prisma.projectNotificationEmail.updateMany({
    where: {
      id: {
        in: input.groupIds,
      },
    },
    data: {
      status: input.status,
      outboundEmailDeliveryId: input.outboundEmailDeliveryId ?? null,
      errorCode: input.errorCode ?? null,
      claimToken: null,
      completedAt: input.now,
    },
  });
}

async function dispatchRecipientBatch(input: {
  recipient: VerifiedRecipient;
  groups: ClaimedEmailGroup[];
  appOrigin: string;
  now: Date;
}): Promise<{
  status: "sent" | "skipped" | "failed";
  attempted: boolean;
  sentGroupIds: string[];
  skippedGroupIds: string[];
  failedGroupIds: string[];
}> {
  const sections: PreparedSection[] = [];
  for (const group of input.groups) {
    const section = await buildPreparedSection({
      group,
      appOrigin: input.appOrigin,
      now: input.now,
    });

    if (section) {
      sections.push(section);
    }
  }

  const sectionGroupIds = new Set(sections.map((section) => section.groupId));
  const skippedGroupIds = input.groups
    .filter((group) => !sectionGroupIds.has(group.id))
    .map((group) => group.id);

  await markGroupsComplete({
    groupIds: skippedGroupIds,
    status: "skipped",
    now: input.now,
    errorCode: "no-current-eligible-notifications",
  });

  if (sections.length === 0) {
    return {
      status: "skipped",
      attempted: false,
      sentGroupIds: [],
      skippedGroupIds,
      failedGroupIds: [],
    };
  }

  const notificationIds = sections.flatMap((section) => section.notificationIds);
  if (!input.recipient.email || !input.recipient.emailVerified) {
    await markGroupsComplete({
      groupIds: sections.map((section) => section.groupId),
      status: "skipped",
      now: input.now,
      errorCode: "recipient-email-not-verified",
    });
    return {
      status: "skipped",
      attempted: false,
      sentGroupIds: [],
      skippedGroupIds: [
        ...skippedGroupIds,
        ...sections.map((section) => section.groupId),
      ],
      failedGroupIds: [],
    };
  }

  const message = buildProjectNotificationDigestEmail({
    sections: sections.map((section) => section.section),
    notificationsUrl: buildAbsoluteUrl(input.appOrigin, "/account/notifications"),
  });

  const result = await sendOutboundEmail({
    templateKey: "project_notification_digest",
    to: input.recipient.email,
    subject: message.subject,
    text: message.text,
    html: message.html,
    metadata: {
      recipientUserId: input.recipient.id,
      projectIds: sections.map((section) => section.projectId),
      groupIds: sections.map((section) => section.groupId),
      notificationIds,
      notificationCount: notificationIds.length,
      projectSectionCount: sections.length,
    },
  });
  const mapped = mapDeliveryStatus(result);
  const deliveredGroupIds = sections.map((section) => section.groupId);

  await markGroupsComplete({
    groupIds: deliveredGroupIds,
    status: mapped.status,
    now: input.now,
    outboundEmailDeliveryId: mapped.deliveryId,
    errorCode: mapped.errorCode,
  });

  return {
    status: mapped.status,
    attempted: true,
    sentGroupIds: mapped.status === "sent" ? deliveredGroupIds : [],
    skippedGroupIds:
      mapped.status === "skipped"
        ? [...skippedGroupIds, ...deliveredGroupIds]
        : skippedGroupIds,
    failedGroupIds: mapped.status === "failed" ? deliveredGroupIds : [],
  };
}

async function loadClaimedRecipientIds(input: {
  groupIds: string[];
}): Promise<string[]> {
  if (input.groupIds.length === 0) {
    return [];
  }

  const rows = await prisma.projectNotificationEmail.findMany({
    where: {
      id: {
        in: input.groupIds,
      },
    },
    distinct: ["recipientUserId"],
    orderBy: [{ recipientUserId: "asc" }],
    select: {
      recipientUserId: true,
    },
  });

  return rows.map((row) => row.recipientUserId);
}

export async function dispatchProjectNotificationEmails(input: {
  appOrigin?: string | null;
  now?: Date;
} = {}): Promise<DispatchProjectNotificationEmailsSummary> {
  const appOrigin = normalizeAppOrigin(input.appOrigin);
  const now = input.now ?? new Date();
  const claimToken = createClaimToken();
  const summary: DispatchProjectNotificationEmailsSummary = {
    notificationsReconciled: 0,
    groupsClaimed: 0,
    recipientEmailsAttempted: 0,
    recipientEmailsSent: 0,
    recipientEmailsSkipped: 0,
    recipientEmailsFailed: 0,
    groupsSent: 0,
    groupsSkipped: 0,
    groupsFailed: 0,
    errors: 0,
  };

  try {
    summary.notificationsReconciled =
      await reconcilePendingNotificationEmailGroups();
  } catch (error) {
    summary.errors += 1;
    logServerError("dispatchProjectNotificationEmails.reconcile", error);
  }

  await releaseStaleDispatchingGroups(now);

  const claimedGroupIds = await claimDueGroups({
    now,
    limit: MAX_GROUPS_PER_DISPATCH,
    claimToken,
  });
  summary.groupsClaimed = claimedGroupIds.length;

  const recipientIds = await loadClaimedRecipientIds({
    groupIds: claimedGroupIds,
  });

  for (const recipientUserId of recipientIds) {
    try {
      const groups = await loadClaimedGroupsForRecipient({
        recipientUserId,
        claimToken,
      });
      const recipient = groups[0]?.recipient;
      if (!recipient || groups.length === 0) {
        continue;
      }

      const outcome = await dispatchRecipientBatch({
        recipient,
        groups,
        appOrigin,
        now,
      });

      if (outcome.attempted) {
        summary.recipientEmailsAttempted += 1;
      }

      if (outcome.status === "sent") {
        summary.recipientEmailsSent += 1;
      } else if (outcome.status === "failed") {
        summary.recipientEmailsFailed += 1;
      } else {
        summary.recipientEmailsSkipped += 1;
      }

      summary.groupsSent += outcome.sentGroupIds.length;
      summary.groupsSkipped += outcome.skippedGroupIds.length;
      summary.groupsFailed += outcome.failedGroupIds.length;
    } catch (error) {
      summary.errors += 1;
      logServerError("dispatchProjectNotificationEmails.recipient", error, {
        recipientUserId,
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
