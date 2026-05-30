import { logServerError } from "@/lib/observability/logger";
import { parseMentions, type ParsedMention } from "@/lib/mention";
import {
  requireAgentProjectScopes,
  requireProjectRole,
  type AgentProjectAccessContext,
} from "@/lib/services/project-access-service";
import { touchProjectActivity } from "@/lib/services/project-activity-service";
import { type DbClient, withActorRlsContext } from "@/lib/services/rls-context";
import {
  type NotificationActorKind,
  type TaskCommentMentionNotificationInput,
  createTaskCommentMentionNotification,
} from "@/lib/services/notification-service";
import {
  mapTaskPersonSummary,
  type TaskPersonSummary,
} from "@/lib/task-person";

const MAX_TASK_COMMENT_LENGTH = 4000;

interface ServiceErrorResult {
  ok: false;
  status: number;
  error: string;
}

interface ServiceSuccessResult<T> {
  ok: true;
  data: T;
}

type ServiceResult<T> = ServiceSuccessResult<T> | ServiceErrorResult;

export type TaskCommentAuthorSummary = TaskPersonSummary;

export interface TaskCommentSummary {
  id: string;
  content: string;
  createdAt: Date;
  author: TaskCommentAuthorSummary;
}

interface PendingMentionNotification {
  recipientUserId: string;
  notification: TaskCommentMentionNotificationInput;
}

interface MentionedProjectMember {
  userId: string;
  username: string;
  discriminator: string | null;
  displayName: string;
}

export interface TaskCommentMentionSelection {
  userId: string;
  username: string;
  discriminator: string | null;
}

interface MentionResolutionData {
  projectName: string;
  mentionedUsers: MentionedProjectMember[];
}

interface CreateTaskCommentTransactionData {
  comment: TaskCommentSummary;
  pendingNotifications: PendingMentionNotification[];
}

function createError(status: number, error: string): ServiceErrorResult {
  return { ok: false, status, error };
}

function normalizeActorUserId(actorUserId: string | null | undefined): string {
  if (typeof actorUserId !== "string") {
    return "";
  }

  return actorUserId.trim();
}

function normalizeText(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function buildAgentDisplayName(label: string | null | undefined): string {
  const normalizedLabel = normalizeText(label);
  return normalizedLabel ? `${normalizedLabel} (agent)` : "Agent";
}

async function resolveAgentCredentialLabel(input: {
  db: DbClient;
  agentAccess: AgentProjectAccessContext;
}): Promise<string | null> {
  const credential = await input.db.apiCredential.findFirst({
    where: {
      id: input.agentAccess.credentialId,
      projectId: input.agentAccess.projectId,
    },
    select: {
      label: true,
    },
  });

  return normalizeText(credential?.label) || null;
}

function mapTaskComment(input: {
  id: string;
  content: string;
  createdAt: Date;
  author: {
    id: string;
    name: string | null;
    email: string | null;
    username: string | null;
    usernameDiscriminator: string | null;
    avatarSeed: string | null;
  };
}): TaskCommentSummary {
  return {
    id: input.id,
    content: input.content,
    createdAt: input.createdAt,
    author: mapTaskPersonSummary(input.author)!,
  };
}

async function touchTaskActivity(
  db: DbClient,
  taskId: string,
  actorUserId: string
) {
  await db.task.update({
    where: { id: taskId },
    data: {
      updatedByUserId: actorUserId,
    },
    select: {
      id: true,
    },
  });
}

function addMentionResolutionCandidate(input: {
  user: {
    id: string;
    name: string | null;
    email: string | null;
    username: string | null;
    usernameDiscriminator: string | null;
  };
  usernameTagToUser: Map<string, MentionedProjectMember>;
  usernameToUser: Map<string, MentionedProjectMember | null>;
}) {
  if (!input.user.username || !input.user.usernameDiscriminator) {
    return;
  }

  const userData: MentionedProjectMember = {
    userId: input.user.id,
    displayName: input.user.name || input.user.email || input.user.username,
    username: input.user.username,
    discriminator: input.user.usernameDiscriminator,
  };
  const usernameKey = input.user.username.toLowerCase();
  const usernameTagKey = `${usernameKey}#${input.user.usernameDiscriminator.toLowerCase()}`;

  input.usernameTagToUser.set(usernameTagKey, userData);

  if (!input.usernameToUser.has(usernameKey)) {
    input.usernameToUser.set(usernameKey, userData);
    return;
  }

  const existingUsernameMatch = input.usernameToUser.get(usernameKey);
  if (
    existingUsernameMatch &&
    existingUsernameMatch.userId !== userData.userId
  ) {
    input.usernameToUser.set(usernameKey, null);
  }
}

async function resolveMentionedProjectMembers(
  db: DbClient,
  projectId: string,
  mentions: ParsedMention[],
  mentionSelections: TaskCommentMentionSelection[] = []
): Promise<ServiceResult<MentionResolutionData>> {
  if (mentions.length === 0) {
    return {
      ok: true,
      data: {
        projectName: "",
        mentionedUsers: [],
      },
    };
  }

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      owner: {
        select: {
          id: true,
          name: true,
          email: true,
          username: true,
          usernameDiscriminator: true,
        },
      },
      memberships: {
        select: {
          userId: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              username: true,
              usernameDiscriminator: true,
            },
          },
        },
      },
    },
  });

  if (!project) {
    return createError(404, "project-not-found");
  }

  const usernameTagToUser = new Map<string, MentionedProjectMember>();
  const usernameToUser = new Map<string, MentionedProjectMember | null>();
  const candidateUserIds = new Set<string>();

  addMentionResolutionCandidate({
    user: project.owner,
    usernameTagToUser,
    usernameToUser,
  });
  candidateUserIds.add(project.owner.id);

  for (const membership of project.memberships) {
    if (candidateUserIds.has(membership.userId)) {
      continue;
    }

    addMentionResolutionCandidate({
      user: membership.user,
      usernameTagToUser,
      usernameToUser,
    });
    candidateUserIds.add(membership.userId);
  }

  const mentionedUsers: MentionedProjectMember[] = [];
  const mentionedUsernameKeys = new Set(
    mentions.map((mention) => mention.username.toLowerCase())
  );

  for (const selection of mentionSelections) {
    const usernameKey = selection.username.toLowerCase();
    const discriminatorKey = selection.discriminator?.toLowerCase() ?? "";
    if (!mentionedUsernameKeys.has(usernameKey) || !discriminatorKey) {
      continue;
    }

    const selectedUser = usernameTagToUser.get(
      `${usernameKey}#${discriminatorKey}`
    );
    if (!selectedUser || selectedUser.userId !== selection.userId) {
      continue;
    }

    if (!mentionedUsers.some((user) => user.userId === selectedUser.userId)) {
      mentionedUsers.push(selectedUser);
    }
  }

  for (const mention of mentions) {
    const matchedUser = mention.discriminator
      ? usernameTagToUser.get(
          `${mention.username.toLowerCase()}#${mention.discriminator.toLowerCase()}`
        )
      : usernameToUser.get(mention.username.toLowerCase());

    if (
      matchedUser &&
      !mentionedUsers.some((user) => user.userId === matchedUser.userId)
    ) {
      mentionedUsers.push(matchedUser);
    }
  }

  return {
    ok: true,
    data: {
      projectName: project.name,
      mentionedUsers,
    },
  };
}

function buildPendingMentionNotifications(input: {
  actorUserId: string;
  authorDisplayName: string;
  authorUsername: string | null;
  actorKind: NotificationActorKind;
  actorDisplayName: string;
  actorCredentialId: string | null;
  actorCredentialLabel: string | null;
  commentId: string;
  taskId: string;
  taskTitle: string;
  projectId: string;
  projectName: string;
  mentionedUsers: MentionedProjectMember[];
}): PendingMentionNotification[] {
  const taskPath =
    `/projects/${encodeURIComponent(input.projectId)}` +
    `?taskId=${encodeURIComponent(input.taskId)}` +
    `&commentId=${encodeURIComponent(input.commentId)}`;

  return input.mentionedUsers
    .filter(
      (mentionedUser) =>
        input.actorKind === "agent" ||
        mentionedUser.userId !== input.actorUserId
    )
    .map((mentionedUser) => ({
      recipientUserId: mentionedUser.userId,
      notification: {
        commentId: input.commentId,
        taskId: input.taskId,
        taskTitle: input.taskTitle,
        projectId: input.projectId,
        projectName: input.projectName,
        mentionedUsername: mentionedUser.username,
        mentionedUserId: mentionedUser.userId,
        mentionedUserDisplayName: mentionedUser.displayName,
        authorUsername: input.authorUsername || "",
        authorDisplayName: input.authorDisplayName,
        actorKind: input.actorKind,
        actorUserId: input.actorUserId,
        actorDisplayName: input.actorDisplayName,
        actorCredentialId: input.actorCredentialId,
        actorCredentialLabel: input.actorCredentialLabel,
        targetPath: taskPath,
      },
    }));
}

async function dispatchMentionNotifications(
  actorUserId: string,
  pendingNotifications: PendingMentionNotification[]
) {
  for (const pendingNotification of pendingNotifications) {
    try {
      await withActorRlsContext(actorUserId, async (db) => {
        await createTaskCommentMentionNotification({
          db,
          ...pendingNotification,
        });
      });
    } catch (error) {
      logServerError("createTaskCommentForProject.mentionNotification", error);
    }
  }
}

export async function listTaskCommentsForProject(input: {
  actorUserId: string;
  projectId: string;
  taskId: string;
  agentAccess?: AgentProjectAccessContext;
}): Promise<ServiceResult<{ comments: TaskCommentSummary[] }>> {
  const actorUserId = normalizeActorUserId(input.actorUserId);
  if (!actorUserId) {
    return createError(401, "unauthorized");
  }

  const agentScopeAccess = requireAgentProjectScopes({
    agentAccess: input.agentAccess,
    projectId: input.projectId,
    requiredScopes: ["task:read"],
  });
  if (!agentScopeAccess.ok) {
    return createError(agentScopeAccess.status, agentScopeAccess.error);
  }

  return withActorRlsContext(actorUserId, async (db) => {
    const access = await requireProjectRole({
      actorUserId,
      projectId: input.projectId,
      minimumRole: "viewer",
      db,
    });
    if (!access.ok) {
      return createError(access.status, access.error);
    }

    const task = await db.task.findUnique({
      where: { id: input.taskId },
      select: {
        id: true,
        projectId: true,
      },
    });

    if (!task || task.projectId !== input.projectId) {
      return createError(404, "task-not-found");
    }

    try {
      const comments = await db.taskComment.findMany({
        where: {
          taskId: input.taskId,
        },
        orderBy: [{ createdAt: "asc" }],
        select: {
          id: true,
          content: true,
          createdAt: true,
          author: {
            select: {
              id: true,
              name: true,
              email: true,
              username: true,
              usernameDiscriminator: true,
              avatarSeed: true,
            },
          },
        },
      });

      return {
        ok: true,
        data: {
          comments: comments.map(mapTaskComment),
        },
      };
    } catch (error) {
      logServerError("listTaskCommentsForProject", error);
      return createError(500, "comments-list-failed");
    }
  });
}

export async function createTaskCommentForProject(input: {
  actorUserId: string;
  projectId: string;
  taskId: string;
  content: string;
  mentionSelections?: TaskCommentMentionSelection[];
  agentAccess?: AgentProjectAccessContext;
}): Promise<ServiceResult<{ comment: TaskCommentSummary }>> {
  const actorUserId = normalizeActorUserId(input.actorUserId);
  if (!actorUserId) {
    return createError(401, "unauthorized");
  }

  const content = typeof input.content === "string" ? input.content.trim() : "";
  if (!content) {
    return createError(400, "content-required");
  }
  if (content.length > MAX_TASK_COMMENT_LENGTH) {
    return createError(400, "content-too-long");
  }

  const agentScopeAccess = requireAgentProjectScopes({
    agentAccess: input.agentAccess,
    projectId: input.projectId,
    requiredScopes: ["task:write"],
  });
  if (!agentScopeAccess.ok) {
    return createError(agentScopeAccess.status, agentScopeAccess.error);
  }

  const result: ServiceResult<CreateTaskCommentTransactionData> =
    await withActorRlsContext(actorUserId, async (db) => {
      const access = await requireProjectRole({
        actorUserId,
        projectId: input.projectId,
        minimumRole: "editor",
        db,
      });
      if (!access.ok) {
        return createError(access.status, access.error);
      }

      const task = await db.task.findUnique({
        where: { id: input.taskId },
        select: {
          id: true,
          title: true,
          projectId: true,
        },
      });

      if (!task || task.projectId !== input.projectId) {
        return createError(404, "task-not-found");
      }

      const { mentions } = parseMentions(content);
      const mentionResolution = await resolveMentionedProjectMembers(
        db,
        input.projectId,
        mentions,
        input.mentionSelections
      );
      if (!mentionResolution.ok) {
        return mentionResolution;
      }

      try {
        const comment = await db.taskComment.create({
          data: {
            taskId: input.taskId,
            authorUserId: actorUserId,
            content,
          },
          select: {
            id: true,
            content: true,
            createdAt: true,
            author: {
              select: {
                id: true,
                name: true,
                email: true,
                username: true,
                usernameDiscriminator: true,
                avatarSeed: true,
              },
            },
          },
        });

        await touchTaskActivity(db, input.taskId, actorUserId);
        await touchProjectActivity({ db, projectId: input.projectId });

        const authorDisplayName =
          comment.author.name ||
          comment.author.email ||
          comment.author.username ||
          "Someone";
        let actorKind: NotificationActorKind = "user";
        let actorDisplayName = authorDisplayName;
        let actorCredentialId: string | null = null;
        let actorCredentialLabel: string | null = null;

        if (input.agentAccess) {
          actorKind = "agent";
          actorCredentialId = input.agentAccess.credentialId;
          actorCredentialLabel = await resolveAgentCredentialLabel({
            db,
            agentAccess: input.agentAccess,
          });
          actorDisplayName = buildAgentDisplayName(actorCredentialLabel);
        }

        const pendingNotifications = buildPendingMentionNotifications({
          actorUserId,
          authorDisplayName,
          authorUsername: comment.author.username,
          actorKind,
          actorDisplayName,
          actorCredentialId,
          actorCredentialLabel,
          commentId: comment.id,
          taskId: input.taskId,
          taskTitle: task.title,
          projectId: input.projectId,
          projectName: mentionResolution.data.projectName,
          mentionedUsers: mentionResolution.data.mentionedUsers,
        });

        return {
          ok: true,
          data: {
            comment: mapTaskComment(comment),
            pendingNotifications,
          },
        };
      } catch (error) {
        logServerError("createTaskCommentForProject", error);
        return createError(500, "comment-create-failed");
      }
    });

  if (!result.ok) {
    return result;
  }

  await dispatchMentionNotifications(
    actorUserId,
    result.data.pendingNotifications
  );

  return {
    ok: true,
    data: {
      comment: result.data.comment,
    },
  };
}

export interface TaskCommentReactionSummary {
  id: string;
  emoji: string;
  user: TaskCommentAuthorSummary;
  createdAt: Date;
}

export interface TaskCommentReactionGroup {
  emoji: string;
  count: number;
  reacted: boolean;
  reactions: TaskCommentReactionSummary[];
}

function groupReactionsForActor(
  rawReactions: Array<{
    id: string;
    emoji: string;
    createdAt: Date;
    user: {
      id: string;
      name: string | null;
      email: string | null;
      username: string | null;
      usernameDiscriminator: string | null;
      avatarSeed: string | null;
    };
  }>,
  actorUserId: string
): TaskCommentReactionGroup[] {
  const actorUserIdLower = actorUserId.toLowerCase();
  const grouped = new Map<string, TaskCommentReactionGroup>();

  for (const r of rawReactions) {
    const summary: TaskCommentReactionSummary = {
      id: r.id,
      emoji: r.emoji,
      user: mapTaskPersonSummary(r.user)!,
      createdAt: r.createdAt,
    };

    if (!grouped.has(r.emoji)) {
      grouped.set(r.emoji, {
        emoji: r.emoji,
        count: 0,
        reacted: false,
        reactions: [],
      });
    }

    const group = grouped.get(r.emoji)!;
    group.count++;
    group.reactions.push(summary);
    if (r.user.id.toLowerCase() === actorUserIdLower) {
      group.reacted = true;
    }
  }

  return Array.from(grouped.values());
}

export async function listTaskCommentReactionsForComment(input: {
  actorUserId: string;
  projectId: string;
  commentId: string;
  agentAccess?: AgentProjectAccessContext;
}): Promise<ServiceResult<{ reactions: TaskCommentReactionGroup[] }>> {
  const actorUserId = normalizeActorUserId(input.actorUserId);
  if (!actorUserId) return createError(401, "unauthorized");

  const agentScopeAccess = requireAgentProjectScopes({
    agentAccess: input.agentAccess,
    projectId: input.projectId,
    requiredScopes: ["task:read"],
  });
  if (!agentScopeAccess.ok)
    return createError(agentScopeAccess.status, agentScopeAccess.error);

  return withActorRlsContext(actorUserId, async (db) => {
    const access = await requireProjectRole({
      actorUserId,
      projectId: input.projectId,
      minimumRole: "viewer",
      db,
    });
    if (!access.ok) return createError(access.status, access.error);

    const comment = await db.taskComment.findUnique({
      where: { id: input.commentId },
      select: { id: true, taskId: true },
    });
    if (!comment) return createError(404, "comment-not-found");

    const task = await db.task.findUnique({
      where: { id: comment.taskId },
      select: { projectId: true },
    });
    if (!task || task.projectId !== input.projectId)
      return createError(404, "comment-not-found");

    try {
      const rawReactions = await db.taskCommentReaction.findMany({
        where: { commentId: input.commentId },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          emoji: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              username: true,
              usernameDiscriminator: true,
              avatarSeed: true,
            },
          },
        },
      });

      return {
        ok: true,
        data: { reactions: groupReactionsForActor(rawReactions, actorUserId) },
      };
    } catch (error) {
      logServerError("listTaskCommentReactionsForComment", error);
      return createError(500, "reactions-list-failed");
    }
  });
}

export async function addTaskCommentReaction(input: {
  actorUserId: string;
  projectId: string;
  commentId: string;
  emoji: string;
  agentAccess?: AgentProjectAccessContext;
}): Promise<ServiceResult<{ reactions: TaskCommentReactionGroup[] }>> {
  const actorUserId = normalizeActorUserId(input.actorUserId);
  if (!actorUserId) return createError(401, "unauthorized");

  const emoji = typeof input.emoji === "string" ? input.emoji.trim() : "";
  if (!emoji) return createError(400, "emoji-required");
  if (emoji.length > 32) return createError(400, "emoji-too-long");

  const agentScopeAccess = requireAgentProjectScopes({
    agentAccess: input.agentAccess,
    projectId: input.projectId,
    requiredScopes: ["task:write"],
  });
  if (!agentScopeAccess.ok)
    return createError(agentScopeAccess.status, agentScopeAccess.error);

  return withActorRlsContext(actorUserId, async (db) => {
    const access = await requireProjectRole({
      actorUserId,
      projectId: input.projectId,
      minimumRole: "editor",
      db,
    });
    if (!access.ok) return createError(access.status, access.error);

    const comment = await db.taskComment.findUnique({
      where: { id: input.commentId },
      select: { id: true, taskId: true },
    });
    if (!comment) return createError(404, "comment-not-found");

    const task = await db.task.findUnique({
      where: { id: comment.taskId },
      select: { projectId: true },
    });
    if (!task || task.projectId !== input.projectId)
      return createError(404, "comment-not-found");

    try {
      const existing = await db.taskCommentReaction.findMany({
        where: { commentId: input.commentId, userId: actorUserId },
      });

      // If user already has this exact emoji, remove it (click = toggle off)
      const sameEmoji = existing.find((r) => r.emoji === emoji);
      if (sameEmoji) {
        await db.taskCommentReaction.delete({ where: { id: sameEmoji.id } });
        await touchProjectActivity({ db, projectId: input.projectId });
        const rawReactions = await db.taskCommentReaction.findMany({
          where: { commentId: input.commentId },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            emoji: true,
            createdAt: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                username: true,
                usernameDiscriminator: true,
                avatarSeed: true,
              },
            },
          },
        });
        return {
          ok: true,
          data: {
            reactions: groupReactionsForActor(rawReactions, actorUserId),
          },
        };
      }

      if (existing.length > 0) {
        await db.taskCommentReaction.deleteMany({
          where: { commentId: input.commentId, userId: actorUserId },
        });
      }

      if (emoji) {
        await db.taskCommentReaction.create({
          data: { commentId: input.commentId, userId: actorUserId, emoji },
        });
      }

      await touchProjectActivity({ db, projectId: input.projectId });

      const rawReactions = await db.taskCommentReaction.findMany({
        where: { commentId: input.commentId },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          emoji: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              username: true,
              usernameDiscriminator: true,
              avatarSeed: true,
            },
          },
        },
      });

      return {
        ok: true,
        data: { reactions: groupReactionsForActor(rawReactions, actorUserId) },
      };
    } catch (error) {
      logServerError("addTaskCommentReaction", error);
      return createError(500, "reaction-toggle-failed");
    }
  });
}

export async function removeTaskCommentReaction(input: {
  actorUserId: string;
  projectId: string;
  reactionId: string;
  agentAccess?: AgentProjectAccessContext;
}): Promise<ServiceResult<{ reactions: TaskCommentReactionGroup[] }>> {
  const actorUserId = normalizeActorUserId(input.actorUserId);
  if (!actorUserId) return createError(401, "unauthorized");

  const agentScopeAccess = requireAgentProjectScopes({
    agentAccess: input.agentAccess,
    projectId: input.projectId,
    requiredScopes: ["task:write"],
  });
  if (!agentScopeAccess.ok)
    return createError(agentScopeAccess.status, agentScopeAccess.error);

  return withActorRlsContext(actorUserId, async (db) => {
    const access = await requireProjectRole({
      actorUserId,
      projectId: input.projectId,
      minimumRole: "editor",
      db,
    });
    if (!access.ok) return createError(access.status, access.error);

    const reaction = await db.taskCommentReaction.findUnique({
      where: { id: input.reactionId },
      include: { comment: { select: { id: true, taskId: true } } },
    });
    if (!reaction) return createError(404, "reaction-not-found");

    const task = await db.task.findUnique({
      where: { id: reaction.comment.taskId },
      select: { projectId: true },
    });
    if (!task || task.projectId !== input.projectId)
      return createError(404, "reaction-not-found");
    if (reaction.userId !== actorUserId)
      return createError(403, "not-reaction-owner");

    try {
      await db.taskCommentReaction.delete({ where: { id: input.reactionId } });
      await touchProjectActivity({ db, projectId: input.projectId });

      const rawReactions = await db.taskCommentReaction.findMany({
        where: { commentId: reaction.commentId },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          emoji: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              username: true,
              usernameDiscriminator: true,
              avatarSeed: true,
            },
          },
        },
      });

      return {
        ok: true,
        data: { reactions: groupReactionsForActor(rawReactions, actorUserId) },
      };
    } catch (error) {
      logServerError("removeTaskCommentReaction", error);
      return createError(500, "reaction-remove-failed");
    }
  });
}
