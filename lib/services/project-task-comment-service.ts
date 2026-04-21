import { resolveAvatarSeed } from "@/lib/avatar";
import { logServerError } from "@/lib/observability/logger";
import {
  requireAgentProjectScopes,
  requireProjectRole,
  type AgentProjectAccessContext,
} from "@/lib/services/project-access-service";
import { type DbClient, withActorRlsContext } from "@/lib/services/rls-context";
import { validateUsernameDiscriminator } from "@/lib/services/account-security-policy";

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

export interface TaskCommentAuthorSummary {
  id: string;
  displayName: string;
  usernameTag: string | null;
  avatarSeed: string;
}

export interface TaskCommentSummary {
  id: string;
  content: string;
  createdAt: Date;
  author: TaskCommentAuthorSummary;
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

function getEmailLocalPart(email: string | null | undefined): string | null {
  if (!email || !email.includes("@")) {
    return null;
  }

  return email.split("@", 1)[0] ?? null;
}

function buildUsernameTag(
  username: string | null | undefined,
  usernameDiscriminator: string | null | undefined
): string | null {
  if (
    !username ||
    !usernameDiscriminator ||
    !validateUsernameDiscriminator(usernameDiscriminator)
  ) {
    return null;
  }

  return `${username}#${usernameDiscriminator}`;
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
  const usernameTag = buildUsernameTag(
    input.author.username,
    input.author.usernameDiscriminator
  );
  const displayName =
    input.author.username ??
    input.author.name ??
    getEmailLocalPart(input.author.email) ??
    "Account";

  return {
    id: input.id,
    content: input.content,
    createdAt: input.createdAt,
    author: {
      id: input.author.id,
      displayName,
      usernameTag,
      avatarSeed: resolveAvatarSeed(input.author.avatarSeed, input.author.id),
    },
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

  return withActorRlsContext(actorUserId, async (db) => {
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
        projectId: true,
      },
    });

    if (!task || task.projectId !== input.projectId) {
      return createError(404, "task-not-found");
    }

    try {
      const comment = await db.$transaction(async (tx) => {
        const createdComment = await tx.taskComment.create({
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

        await touchTaskActivity(tx, input.taskId, actorUserId);

        return createdComment;
      });

      return {
        ok: true,
        data: {
          comment: mapTaskComment(comment),
        },
      };
    } catch (error) {
      logServerError("createTaskCommentForProject", error);
      return createError(500, "comment-create-failed");
    }
  });
}
