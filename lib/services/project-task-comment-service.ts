import { logServerError } from "@/lib/observability/logger";
import { parseMentions } from "@/lib/mention";
import {
  requireAgentProjectScopes,
  requireProjectRole,
  type AgentProjectAccessContext,
} from "@/lib/services/project-access-service";
import { type DbClient, withActorRlsContext } from "@/lib/services/rls-context";
import {
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

function createError(status: number, error: string): ServiceErrorResult {
  return { ok: false, status, error };
}

function normalizeActorUserId(actorUserId: string | null | undefined): string {
  if (typeof actorUserId !== "string") {
    return "";
  }

  return actorUserId.trim();
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

  const result = await withActorRlsContext(actorUserId, async (db) => {
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

    // Fetch project with owner and members for mention resolution
    const project = await db.project.findUnique({
      where: { id: input.projectId },
      select: {
        id: true,
        name: true,
        ownerId: true,
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            username: true,
            usernameDiscriminator: true,
            avatarSeed: true,
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
                avatarSeed: true,
              },
            },
          },
        },
      },
    });

    if (!project) {
      return createError(404, "project-not-found");
    }

    // Build a map of username#discriminator -> user for mention resolution
    // Also build a separate map for username-only lookups (for backward compatibility)
    const usernameTagToUser = new Map<string, {
      id: string;
      displayName: string;
      username: string;
      discriminator: string | null;
    }>();
    const usernameToUser = new Map<string, {
      id: string;
      displayName: string;
      username: string;
      discriminator: string | null;
    }>();

    // Add owner (only if username is set)
    if (project.owner.username && project.owner.usernameDiscriminator) {
      const usernameTag = `${project.owner.username}#${project.owner.usernameDiscriminator}`;
      const userData = {
        id: project.owner.id,
        displayName: project.owner.name || project.owner.email || project.owner.username,
        username: project.owner.username,
        discriminator: project.owner.usernameDiscriminator,
      };
      usernameTagToUser.set(usernameTag.toLowerCase(), userData);
      usernameToUser.set(project.owner.username.toLowerCase(), userData);
    }

    // Add members
    for (const membership of project.memberships) {
      if (membership.user.username && membership.user.usernameDiscriminator) {
        const usernameTag = `${membership.user.username}#${membership.user.usernameDiscriminator}`;
        const userData = {
          id: membership.userId,
          displayName: membership.user.name || membership.user.email || membership.user.username,
          username: membership.user.username,
          discriminator: membership.user.usernameDiscriminator,
        };
        usernameTagToUser.set(usernameTag.toLowerCase(), userData);
        usernameToUser.set(membership.user.username.toLowerCase(), userData);
      }
    }

    // Parse mentions from comment content
    const { mentions } = parseMentions(content);

    // Resolve mentions to user IDs (only existing project members)
    const mentionedUsers: Array<{
      userId: string;
      username: string;
      discriminator: string | null;
      displayName: string;
    }> = [];

    for (const mention of mentions) {
      // Look up by username#discriminator if discriminator is present
      const matchedUser = mention.discriminator
        ? usernameTagToUser.get(`${mention.username.toLowerCase()}#${mention.discriminator.toLowerCase()}`)
        : usernameToUser.get(mention.username.toLowerCase());

      if (matchedUser) {
        // Avoid duplicates
        if (!mentionedUsers.some((u) => u.userId === matchedUser.id)) {
          mentionedUsers.push({
            userId: matchedUser.id,
            username: matchedUser.username,
            discriminator: matchedUser.discriminator,
            displayName: matchedUser.displayName,
          });
        }
      }
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

      const authorDisplayName = comment.author.name || comment.author.email || comment.author.username || "Someone";
      const taskPath = `/projects/${input.projectId}/tasks/${input.taskId}`;
      const pendingNotifications: PendingMentionNotification[] = [];

      for (const mentionedUser of mentionedUsers) {
        // Don't notify the author if they mention themselves
        if (mentionedUser.userId === actorUserId) {
          continue;
        }

        pendingNotifications.push({
          recipientUserId: mentionedUser.userId,
          notification: {
            commentId: comment.id,
            taskId: input.taskId,
            taskTitle: task.title,
            projectId: input.projectId,
            projectName: project.name,
            mentionedUsername: mentionedUser.username,
            mentionedUserId: mentionedUser.userId,
            mentionedUserDisplayName: mentionedUser.displayName,
            authorUsername: comment.author.username || "",
            authorDisplayName,
            targetPath: taskPath,
          },
        });
      }

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

  for (const pendingNotification of result.data.pendingNotifications) {
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

  return {
    ok: true,
    data: {
      comment: result.data.comment,
    },
  };
}
