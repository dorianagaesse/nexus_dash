import { Prisma } from "@prisma/client";

import { logServerError } from "@/lib/observability/logger";
import { type DbClient, withActorRlsContext } from "@/lib/services/rls-context";

const NOTIFICATION_TYPE_PROJECT_INVITATION = "project_invitation";
const NOTIFICATION_SOURCE_PROJECT_INVITATION = "project_invitation";

const NOTIFICATION_TYPE_TASK_COMMENT_MENTION = "task_comment_mention";
const NOTIFICATION_SOURCE_TASK_COMMENT_MENTION = "task_comment_mention";

interface ServiceErrorResult {
  ok: false;
  status: number;
  error: string;
}

interface ServiceSuccessResult<T> {
  ok: true;
  status: number;
  data: T;
}

type ServiceResult<T> = ServiceSuccessResult<T> | ServiceErrorResult;

interface PendingInvitationMetadataRow {
  invitationId: string;
  projectId: string;
  projectName: string;
  invitedEmail: string;
  invitedByUserId: string;
  invitedByEmail: string | null;
  invitedByName: string | null;
  invitedByUsername: string | null;
  invitedByUsernameDiscriminator: string | null;
  invitationRole: "editor" | "viewer";
  createdAt: Date;
  expiresAt: Date;
}

interface ProjectInvitationNotificationInput {
  invitationId: string;
  projectId: string;
  projectName: string;
  invitedEmail: string;
  invitedByEmail: string | null;
  invitedByName: string | null;
  invitedByUsername: string | null;
  invitedByUsernameDiscriminator: string | null;
  role: "editor" | "viewer";
  createdAt: Date;
  expiresAt: Date;
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
  readAt: Date | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectInvitationNotificationMetadata {
  invitationId: string;
  projectId: string;
  projectName: string;
  invitedEmail: string;
  invitedByDisplayName: string;
  invitedByEmail: string | null;
  role: "editor" | "viewer";
  expiresAt: string;
  inviteLinkPath: string;
}

export interface TaskCommentMentionNotificationMetadata {
  commentId: string;
  taskId: string;
  taskTitle: string;
  projectId: string;
  projectName: string;
  mentionedUsername: string;
  mentionedUserId: string;
  mentionedUserDisplayName: string;
  authorUsername: string;
  authorDisplayName: string;
  targetPath: string;
}

export type NotificationMetadata =
  | ProjectInvitationNotificationMetadata
  | TaskCommentMentionNotificationMetadata;

export interface NotificationSummary {
  id: string;
  type: string;
  title: string;
  body: string | null;
  targetPath: string | null;
  sourceType: string;
  sourceId: string;
  metadata: NotificationMetadata | null;
  readAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function createError(status: number, error: string): ServiceErrorResult {
  return { ok: false, status, error };
}

function createSuccess<T>(status: number, data: T): ServiceSuccessResult<T> {
  return { ok: true, status, data };
}

function normalizeActorUserId(actorUserId: string | null | undefined): string {
  if (typeof actorUserId !== "string") {
    return "";
  }

  return actorUserId.trim();
}

function normalizeId(id: string | null | undefined): string {
  if (typeof id !== "string") {
    return "";
  }

  return id.trim();
}

function buildProjectInvitationPath(invitationId: string): string {
  return `/invite/project/${encodeURIComponent(invitationId)}`;
}

function buildDisplayName(input: {
  email: string | null;
  name: string | null;
  username: string | null;
  usernameDiscriminator: string | null;
}): string {
  if (input.username && input.usernameDiscriminator) {
    return `${input.username}#${input.usernameDiscriminator}`;
  }

  return input.name || input.email || "Someone";
}

function buildInvitationNotificationMetadata(
  invitation: ProjectInvitationNotificationInput
): ProjectInvitationNotificationMetadata {
  return {
    invitationId: invitation.invitationId,
    projectId: invitation.projectId,
    projectName: invitation.projectName,
    invitedEmail: invitation.invitedEmail,
    invitedByDisplayName: buildDisplayName({
      email: invitation.invitedByEmail,
      name: invitation.invitedByName,
      username: invitation.invitedByUsername,
      usernameDiscriminator: invitation.invitedByUsernameDiscriminator,
    }),
    invitedByEmail: invitation.invitedByEmail,
    role: invitation.role,
    expiresAt: invitation.expiresAt.toISOString(),
    inviteLinkPath: buildProjectInvitationPath(invitation.invitationId),
  };
}

function buildInvitationNotificationContent(
  invitation: ProjectInvitationNotificationInput
) {
  const metadata = buildInvitationNotificationMetadata(invitation);
  const action = invitation.role === "viewer" ? "view" : "collaborate on";

  return {
    title: `Project invitation: ${invitation.projectName}`,
    body: `${metadata.invitedByDisplayName} invited you to ${action} ${invitation.projectName}.`,
    targetPath: metadata.inviteLinkPath,
    metadata,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toJsonObject(metadata: any): Prisma.InputJsonObject {
  return metadata as Prisma.InputJsonObject;
}

function isProjectInvitationMetadata(
  value: Prisma.JsonValue | null
): boolean {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function mapProjectInvitationMetadata(
  value: Prisma.JsonValue | null
): ProjectInvitationNotificationMetadata | null {
  if (!isProjectInvitationMetadata(value)) {
    return null;
  }

  const metadata = value as Record<string, unknown>;
  if (
    typeof metadata.invitationId !== "string" ||
    typeof metadata.projectId !== "string" ||
    typeof metadata.projectName !== "string" ||
    typeof metadata.invitedEmail !== "string" ||
    typeof metadata.invitedByDisplayName !== "string" ||
    (metadata.invitedByEmail !== null && typeof metadata.invitedByEmail !== "string") ||
    (metadata.role !== "editor" && metadata.role !== "viewer") ||
    typeof metadata.expiresAt !== "string" ||
    typeof metadata.inviteLinkPath !== "string"
  ) {
    return null;
  }

  return {
    invitationId: metadata.invitationId,
    projectId: metadata.projectId,
    projectName: metadata.projectName,
    invitedEmail: metadata.invitedEmail,
    invitedByDisplayName: metadata.invitedByDisplayName,
    invitedByEmail: metadata.invitedByEmail,
    role: metadata.role,
    expiresAt: metadata.expiresAt,
    inviteLinkPath: metadata.inviteLinkPath,
  };
}

function mapNotification(notification: NotificationRecord): NotificationSummary {
  let metadata: NotificationMetadata | null = null;

  if (notification.type === NOTIFICATION_TYPE_PROJECT_INVITATION) {
    metadata = mapProjectInvitationMetadata(notification.metadata);
  } else if (notification.type === NOTIFICATION_TYPE_TASK_COMMENT_MENTION) {
    metadata = mapTaskCommentMentionMetadata(notification.metadata);
  }

  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    targetPath: notification.targetPath,
    sourceType: notification.sourceType,
    sourceId: notification.sourceId,
    metadata,
    readAt: notification.readAt?.toISOString() ?? null,
    resolvedAt: notification.resolvedAt?.toISOString() ?? null,
    createdAt: notification.createdAt.toISOString(),
    updatedAt: notification.updatedAt.toISOString(),
  };
}

function mapPendingInvitationRow(
  row: PendingInvitationMetadataRow
): ProjectInvitationNotificationInput {
  return {
    invitationId: row.invitationId,
    projectId: row.projectId,
    projectName: row.projectName,
    invitedEmail: row.invitedEmail,
    invitedByEmail: row.invitedByEmail,
    invitedByName: row.invitedByName,
    invitedByUsername: row.invitedByUsername,
    invitedByUsernameDiscriminator: row.invitedByUsernameDiscriminator,
    role: row.invitationRole,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
  };
}

async function listPendingInvitationRowsForCurrentUser(
  db: DbClient
): Promise<PendingInvitationMetadataRow[]> {
  return db.$queryRaw<PendingInvitationMetadataRow[]>(Prisma.sql`
    SELECT
      invitation_id AS "invitationId",
      project_id AS "projectId",
      project_name AS "projectName",
      invited_email AS "invitedEmail",
      invited_by_user_id AS "invitedByUserId",
      invited_by_email AS "invitedByEmail",
      invited_by_name AS "invitedByName",
      invited_by_username AS "invitedByUsername",
      invited_by_username_discriminator AS "invitedByUsernameDiscriminator",
      invitation_role AS "invitationRole",
      created_at AS "createdAt",
      expires_at AS "expiresAt"
    FROM app.list_pending_project_invitations_for_current_user()
  `);
}

async function createOrRefreshProjectInvitationNotification(input: {
  db: DbClient;
  recipientUserId: string;
  invitation: ProjectInvitationNotificationInput;
}) {
  const content = buildInvitationNotificationContent(input.invitation);
  const metadata = toJsonObject(content.metadata);
  const notificationWhere = {
    recipientUserId: input.recipientUserId,
    sourceType: NOTIFICATION_SOURCE_PROJECT_INVITATION,
    sourceId: input.invitation.invitationId,
  };

  const existingNotifications = await input.db.notification.findMany({
    where: notificationWhere,
    take: 1,
    select: {
      type: true,
      title: true,
      body: true,
      targetPath: true,
      metadata: true,
      resolvedAt: true,
    },
  });

  const existingNotification = existingNotifications[0];

  if (!existingNotification) {
    await input.db.notification.createMany({
      data: [
        {
          recipientUserId: input.recipientUserId,
          type: NOTIFICATION_TYPE_PROJECT_INVITATION,
          title: content.title,
          body: content.body,
          targetPath: content.targetPath,
          sourceType: NOTIFICATION_SOURCE_PROJECT_INVITATION,
          sourceId: input.invitation.invitationId,
          metadata,
          createdAt: input.invitation.createdAt,
        },
      ],
      skipDuplicates: true,
    });
    return;
  }

  const metadataUnchanged =
    JSON.stringify(existingNotification.metadata) === JSON.stringify(metadata);
  const notificationUnchanged =
    existingNotification.type === NOTIFICATION_TYPE_PROJECT_INVITATION &&
    existingNotification.title === content.title &&
    existingNotification.body === content.body &&
    existingNotification.targetPath === content.targetPath &&
    metadataUnchanged &&
    existingNotification.resolvedAt === null;

  if (notificationUnchanged) {
    return;
  }

  await input.db.notification.updateMany({
    where: notificationWhere,
    data: {
      type: NOTIFICATION_TYPE_PROJECT_INVITATION,
      title: content.title,
      body: content.body,
      targetPath: content.targetPath,
      metadata,
      resolvedAt: null,
    },
  });
}

async function syncProjectInvitationNotificationsForUser(
  db: DbClient,
  actorUserId: string
) {
  const invitationRows = await listPendingInvitationRowsForCurrentUser(db);
  const activeInvitationIds = invitationRows.map((row) => row.invitationId);
  const now = new Date();

  if (activeInvitationIds.length === 0) {
    await db.notification.updateMany({
      where: {
        recipientUserId: actorUserId,
        sourceType: NOTIFICATION_SOURCE_PROJECT_INVITATION,
        resolvedAt: null,
      },
      data: {
        resolvedAt: now,
      },
    });
    return;
  }

  await db.notification.updateMany({
    where: {
      recipientUserId: actorUserId,
      sourceType: NOTIFICATION_SOURCE_PROJECT_INVITATION,
      sourceId: {
        notIn: activeInvitationIds,
      },
      resolvedAt: null,
    },
    data: {
      resolvedAt: now,
    },
  });

  const existingNotifications = await db.notification.findMany({
    where: {
      recipientUserId: actorUserId,
      sourceType: NOTIFICATION_SOURCE_PROJECT_INVITATION,
      sourceId: {
        in: activeInvitationIds,
      },
    },
    select: {
      sourceId: true,
      resolvedAt: true,
    },
  });

  const existingInvitationIds = new Set(
    existingNotifications.map((notification) => notification.sourceId)
  );
  const missingInvitationRows = invitationRows.filter(
    (row) => !existingInvitationIds.has(row.invitationId)
  );

  if (missingInvitationRows.length > 0) {
    await db.notification.createMany({
      data: missingInvitationRows.map((row) => {
        const invitation = mapPendingInvitationRow(row);
        const content = buildInvitationNotificationContent(invitation);

        return {
          recipientUserId: actorUserId,
          type: NOTIFICATION_TYPE_PROJECT_INVITATION,
          title: content.title,
          body: content.body,
          targetPath: content.targetPath,
          sourceType: NOTIFICATION_SOURCE_PROJECT_INVITATION,
          sourceId: invitation.invitationId,
          metadata: toJsonObject(content.metadata),
          createdAt: invitation.createdAt,
        };
      }),
      skipDuplicates: true,
    });
  }

  const resolvedActiveInvitationIds = existingNotifications
    .filter((notification) => notification.resolvedAt !== null)
    .map((notification) => notification.sourceId);

  if (resolvedActiveInvitationIds.length > 0) {
    await db.notification.updateMany({
      where: {
        recipientUserId: actorUserId,
        sourceType: NOTIFICATION_SOURCE_PROJECT_INVITATION,
        sourceId: {
          in: resolvedActiveInvitationIds,
        },
        resolvedAt: {
          not: null,
        },
      },
      data: {
        resolvedAt: null,
      },
    });
  }
}

export async function createProjectInvitationNotification(input: {
  db: DbClient;
  recipientUserId: string | null | undefined;
  invitation: ProjectInvitationNotificationInput;
}): Promise<void> {
  const recipientUserId = normalizeActorUserId(input.recipientUserId);
  if (!recipientUserId) {
    return;
  }

  try {
    await createOrRefreshProjectInvitationNotification({
      db: input.db,
      recipientUserId,
      invitation: input.invitation,
    });
  } catch (error) {
    logServerError("createProjectInvitationNotification", error);
  }
}

export async function resolveProjectInvitationNotifications(input: {
  db: DbClient;
  invitationIds: string[];
}): Promise<void> {
  const invitationIds = input.invitationIds.map(normalizeId).filter(Boolean);
  if (invitationIds.length === 0) {
    return;
  }

  try {
    await input.db.notification.updateMany({
      where: {
        sourceType: NOTIFICATION_SOURCE_PROJECT_INVITATION,
        sourceId: {
          in: invitationIds,
        },
        resolvedAt: null,
      },
      data: {
        resolvedAt: new Date(),
        readAt: new Date(),
      },
    });
  } catch (error) {
    logServerError("resolveProjectInvitationNotifications", error);
  }
}

export async function listNotificationsForUser(
  actorUserId: string
): Promise<ServiceResult<{ notifications: NotificationSummary[] }>> {
  const normalizedActorUserId = normalizeActorUserId(actorUserId);
  if (!normalizedActorUserId) {
    return createError(401, "unauthorized");
  }

  return withActorRlsContext(normalizedActorUserId, async (db) => {
    try {
      await syncProjectInvitationNotificationsForUser(db, normalizedActorUserId);

      const notifications = await db.notification.findMany({
        where: {
          recipientUserId: normalizedActorUserId,
          resolvedAt: null,
        },
        orderBy: [{ createdAt: "desc" }],
        select: {
          id: true,
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
      });

      return createSuccess(200, {
        notifications: notifications.map(mapNotification),
      });
    } catch (error) {
      logServerError("listNotificationsForUser", error);
      return createError(500, "notifications-list-failed");
    }
  });
}

export async function countUnreadNotificationsForUser(
  actorUserId: string
): Promise<number> {
  const normalizedActorUserId = normalizeActorUserId(actorUserId);
  if (!normalizedActorUserId) {
    return 0;
  }

  return withActorRlsContext(normalizedActorUserId, async (db) => {
    try {
      await syncProjectInvitationNotificationsForUser(db, normalizedActorUserId);

      return db.notification.count({
        where: {
          recipientUserId: normalizedActorUserId,
          resolvedAt: null,
          readAt: null,
        },
      });
    } catch (error) {
      logServerError("countUnreadNotificationsForUser", error);
      return 0;
    }
  });
}

export async function setNotificationReadState(input: {
  actorUserId: string;
  notificationId: string;
  read: boolean;
}): Promise<ServiceResult<{ notificationId: string; readAt: string | null }>> {
  const actorUserId = normalizeActorUserId(input.actorUserId);
  const notificationId = normalizeId(input.notificationId);
  if (!actorUserId) {
    return createError(401, "unauthorized");
  }
  if (!notificationId) {
    return createError(400, "notification-required");
  }

  return withActorRlsContext(actorUserId, async (db) => {
    try {
      const readAt = input.read ? new Date() : null;
      const result = await db.notification.updateMany({
        where: {
          id: notificationId,
          recipientUserId: actorUserId,
        },
        data: {
          readAt,
        },
      });

      if (result.count !== 1) {
        return createError(404, "notification-not-found");
      }

      return createSuccess(200, {
        notificationId,
        readAt: readAt?.toISOString() ?? null,
      });
    } catch (error) {
      logServerError("setNotificationReadState", error);
      return createError(500, "notification-update-failed");
    }
  });
}

// ---------------------------------------------------------------------------
// Task comment mention notifications
// ---------------------------------------------------------------------------

export interface TaskCommentMentionNotificationInput {
  commentId: string;
  taskId: string;
  taskTitle: string;
  projectId: string;
  projectName: string;
  mentionedUsername: string;
  mentionedUserId: string;
  mentionedUserDisplayName: string;
  authorUsername: string;
  authorDisplayName: string;
  targetPath: string;
}

function buildTaskCommentMentionNotificationContent(
  input: TaskCommentMentionNotificationInput
) {
  return {
    title: `Mentioned in: ${input.taskTitle}`,
    body: `${input.authorDisplayName} mentioned you in a comment on ${input.taskTitle}.`,
    targetPath: input.targetPath,
  };
}

function buildTaskCommentMentionMetadata(
  input: TaskCommentMentionNotificationInput
): TaskCommentMentionNotificationMetadata {
  return {
    commentId: input.commentId,
    taskId: input.taskId,
    taskTitle: input.taskTitle,
    projectId: input.projectId,
    projectName: input.projectName,
    mentionedUsername: input.mentionedUsername,
    mentionedUserId: input.mentionedUserId,
    mentionedUserDisplayName: input.mentionedUserDisplayName,
    authorUsername: input.authorUsername,
    authorDisplayName: input.authorDisplayName,
    targetPath: input.targetPath,
  };
}

function isTaskCommentMentionMetadata(
  value: Prisma.JsonValue | null
): boolean {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      "commentId" in (value as Record<string, unknown>)
  );
}

function mapTaskCommentMentionMetadata(
  value: Prisma.JsonValue | null
): TaskCommentMentionNotificationMetadata | null {
  if (!isTaskCommentMentionMetadata(value)) {
    return null;
  }

  const metadata = value as Record<string, unknown>;
  if (
    typeof metadata.commentId !== "string" ||
    typeof metadata.taskId !== "string" ||
    typeof metadata.taskTitle !== "string" ||
    typeof metadata.projectId !== "string" ||
    typeof metadata.projectName !== "string" ||
    typeof metadata.mentionedUsername !== "string" ||
    typeof metadata.mentionedUserId !== "string" ||
    typeof metadata.mentionedUserDisplayName !== "string" ||
    typeof metadata.authorUsername !== "string" ||
    typeof metadata.authorDisplayName !== "string" ||
    typeof metadata.targetPath !== "string"
  ) {
    return null;
  }

  return {
    commentId: metadata.commentId,
    taskId: metadata.taskId,
    taskTitle: metadata.taskTitle,
    projectId: metadata.projectId,
    projectName: metadata.projectName,
    mentionedUsername: metadata.mentionedUsername,
    mentionedUserId: metadata.mentionedUserId,
    mentionedUserDisplayName: metadata.mentionedUserDisplayName,
    authorUsername: metadata.authorUsername,
    authorDisplayName: metadata.authorDisplayName,
    targetPath: metadata.targetPath,
  };
}

async function createOrRefreshTaskCommentMentionNotification(input: {
  db: DbClient;
  recipientUserId: string;
  notification: TaskCommentMentionNotificationInput;
}) {
  const content = buildTaskCommentMentionNotificationContent(input.notification);
  const metadata = toJsonObject(
    buildTaskCommentMentionMetadata(input.notification)
  );
  const notificationWhere = {
    recipientUserId: input.recipientUserId,
    sourceType: NOTIFICATION_SOURCE_TASK_COMMENT_MENTION,
    sourceId: input.notification.commentId,
  };

  const existingNotifications = await input.db.notification.findMany({
    where: notificationWhere,
    take: 1,
    select: {
      type: true,
      title: true,
      body: true,
      targetPath: true,
      metadata: true,
      resolvedAt: true,
    },
  });

  const existingNotification = existingNotifications[0];

  if (!existingNotification) {
    await input.db.notification.createMany({
      data: [
        {
          recipientUserId: input.recipientUserId,
          type: NOTIFICATION_TYPE_TASK_COMMENT_MENTION,
          title: content.title,
          body: content.body,
          targetPath: content.targetPath,
          sourceType: NOTIFICATION_SOURCE_TASK_COMMENT_MENTION,
          sourceId: input.notification.commentId,
          metadata,
        },
      ],
      skipDuplicates: true,
    });
    return;
  }

  const metadataUnchanged =
    JSON.stringify(existingNotification.metadata) ===
    JSON.stringify(metadata);
  const notificationUnchanged =
    existingNotification.type === NOTIFICATION_TYPE_TASK_COMMENT_MENTION &&
    existingNotification.title === content.title &&
    existingNotification.body === content.body &&
    existingNotification.targetPath === content.targetPath &&
    metadataUnchanged &&
    existingNotification.resolvedAt === null;

  if (notificationUnchanged) {
    return;
  }

  await input.db.notification.updateMany({
    where: notificationWhere,
    data: {
      type: NOTIFICATION_TYPE_TASK_COMMENT_MENTION,
      title: content.title,
      body: content.body,
      targetPath: content.targetPath,
      metadata,
      resolvedAt: null,
    },
  });
}

export async function createTaskCommentMentionNotification(input: {
  db: DbClient;
  recipientUserId: string | null | undefined;
  notification: TaskCommentMentionNotificationInput;
}): Promise<void> {
  const recipientUserId = normalizeActorUserId(input.recipientUserId);
  if (!recipientUserId) {
    return;
  }

  try {
    await createOrRefreshTaskCommentMentionNotification({
      db: input.db,
      recipientUserId,
      notification: input.notification,
    });
  } catch (error) {
    logServerError("createTaskCommentMentionNotification", error);
  }
}

export async function resolveTaskCommentMentionNotifications(input: {
  db: DbClient;
  commentIds: string[];
}): Promise<void> {
  const commentIds = input.commentIds.map(normalizeId).filter(Boolean);
  if (commentIds.length === 0) {
    return;
  }

  try {
    await input.db.notification.updateMany({
      where: {
        sourceType: NOTIFICATION_SOURCE_TASK_COMMENT_MENTION,
        sourceId: {
          in: commentIds,
        },
        resolvedAt: null,
      },
      data: {
        resolvedAt: new Date(),
        readAt: new Date(),
      },
    });
  } catch (error) {
    logServerError("resolveTaskCommentMentionNotifications", error);
  }
}

export async function markAllNotificationsReadForUser(
  actorUserId: string
): Promise<ServiceResult<{ updatedCount: number }>> {
  const normalizedActorUserId = normalizeActorUserId(actorUserId);
  if (!normalizedActorUserId) {
    return createError(401, "unauthorized");
  }

  return withActorRlsContext(normalizedActorUserId, async (db) => {
    try {
      await syncProjectInvitationNotificationsForUser(db, normalizedActorUserId);

      const result = await db.notification.updateMany({
        where: {
          recipientUserId: normalizedActorUserId,
          resolvedAt: null,
          readAt: null,
        },
        data: {
          readAt: new Date(),
        },
      });

      return createSuccess(200, {
        updatedCount: result.count,
      });
    } catch (error) {
      logServerError("markAllNotificationsReadForUser", error);
      return createError(500, "notification-update-failed");
    }
  });
}
