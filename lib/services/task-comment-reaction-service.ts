import {
  mapTaskPersonSummary,
  taskPersonSummarySelect,
  type TaskPersonRecord,
  type TaskPersonSummary,
} from "@/lib/task-person";
import { resolveProjectMutationActor } from "@/lib/services/project-actor-service";
import {
  requireAgentProjectScopes,
  requireProjectRole,
  type AgentProjectAccessContext,
} from "@/lib/services/project-access-service";
import { withActorRlsContext, type DbClient } from "@/lib/services/rls-context";
import { touchProjectActivity } from "@/lib/services/project-activity-service";
import { logServerError } from "@/lib/observability/logger";

interface ReactionActor {
  kind: "human" | "agent";
  id: string | null;
  displayName: string;
}
export interface TaskCommentReactionSummary {
  id: string;
  emoji: string;
  user: TaskPersonSummary | null;
  actor: ReactionActor;
  createdAt: Date;
}
export interface TaskCommentReactionGroup {
  emoji: string;
  count: number;
  reacted: boolean;
  reactions: TaskCommentReactionSummary[];
}
type Result =
  | { ok: true; data: { reactions: TaskCommentReactionGroup[] } }
  | { ok: false; status: number; error: string };
interface ActorInput {
  taskId: string;
  commentId: string;
  actorUserId: string;
  projectId: string;
  agentAccess?: AgentProjectAccessContext;
}
interface StoredReaction {
  id: string;
  emoji: string;
  createdAt: Date;
  actorKind?: "human" | "agent";
  actorCredentialId?: string | null;
  actorDisplayNameSnapshot?: string;
  user: TaskPersonRecord;
}
const reactionSelect = {
  id: true,
  emoji: true,
  createdAt: true,
  actorKind: true,
  actorCredentialId: true,
  actorDisplayNameSnapshot: true,
  user: { select: taskPersonSummarySelect },
} as const;
function error(status: number, message: string): Result {
  return { ok: false, status, error: message };
}
function actorWhere(input: ActorInput) {
  return {
    userId: input.actorUserId,
    actorKind: input.agentAccess ? ("agent" as const) : ("human" as const),
    actorCredentialId: input.agentAccess?.credentialId ?? null,
  };
}
function ownsReaction(
  row: {
    userId: string;
    actorKind?: string;
    actorCredentialId?: string | null;
  },
  input: ActorInput
): boolean {
  const actor = actorWhere(input);
  return (
    row.userId === actor.userId &&
    (row.actorKind ?? "human") === actor.actorKind &&
    (row.actorCredentialId ?? null) === actor.actorCredentialId
  );
}
function groupReactions(
  rows: StoredReaction[],
  input: ActorInput
): TaskCommentReactionGroup[] {
  const groups = new Map<string, TaskCommentReactionGroup>();
  for (const row of rows) {
    const user =
      row.actorKind === "agent" ? null : mapTaskPersonSummary(row.user)!;
    const actor: ReactionActor =
      row.actorKind === "agent"
        ? {
            kind: "agent",
            id: row.actorCredentialId ?? null,
            displayName: row.actorDisplayNameSnapshot || "Former agent",
          }
        : { kind: "human", id: row.user.id, displayName: user!.displayName };
    const group = groups.get(row.emoji) ?? {
      emoji: row.emoji,
      count: 0,
      reacted: false,
      reactions: [],
    };
    group.count++;
    group.reacted ||= ownsReaction({ ...row, userId: row.user.id }, input);
    group.reactions.push({
      id: row.id,
      emoji: row.emoji,
      user,
      actor,
      createdAt: row.createdAt,
    });
    groups.set(row.emoji, group);
  }
  return [...groups.values()];
}
async function readGroups(
  db: DbClient,
  commentId: string,
  input: ActorInput
): Promise<Result> {
  const rows = await db.taskCommentReaction.findMany({
    where: { commentId },
    orderBy: { createdAt: "asc" },
    select: reactionSelect,
  });
  return { ok: true, data: { reactions: groupReactions(rows, input) } };
}
async function hasComment(
  db: DbClient,
  commentId: string,
  projectId: string,
  taskId: string
): Promise<boolean> {
  const comment = await db.taskComment.findUnique({
    where: { id: commentId },
    select: { id: true, taskId: true },
  });
  if (!comment || comment.taskId !== taskId) return false;
  const task = await db.task.findUnique({
    where: { id: comment.taskId },
    select: { projectId: true },
  });
  return !!task && task.projectId === projectId;
}
async function withReactionContext(
  input: ActorInput,
  write: boolean,
  failure: string,
  operation: (db: DbClient) => Promise<Result>
): Promise<Result> {
  if (!input.actorUserId.trim()) return error(401, "unauthorized");
  const scope = requireAgentProjectScopes({
    agentAccess: input.agentAccess,
    projectId: input.projectId,
    requiredScopes: [write ? "task:write" : "task:read"],
  });
  if (!scope.ok) return error(scope.status, scope.error);
  return withActorRlsContext<Result>(
    input.actorUserId,
    async (db) => {
      const access = await requireProjectRole({
        actorUserId: input.actorUserId,
        projectId: input.projectId,
        minimumRole: write ? "editor" : "viewer",
        capability: write ? "task:write" : "task:read",
        db,
      });
      if (!access.ok) return error(access.status, access.error);
      return operation(db);
    },
    { forceTransaction: write }
  ).catch((cause) => {
    logServerError(failure, cause);
    return error(500, failure);
  });
}
export async function listTaskCommentReactionsForComment(
  input: ActorInput & { commentId: string }
): Promise<Result> {
  return withReactionContext(
    input,
    false,
    "reactions-list-failed",
    async (db) => {
      if (!(await hasComment(db, input.commentId, input.projectId, input.taskId)))
        return error(404, "comment-not-found");
      return readGroups(db, input.commentId, input);
    }
  );
}
export async function addTaskCommentReaction(
  input: ActorInput & { commentId: string; emoji: string }
): Promise<Result> {
  const emoji = typeof input.emoji === "string" ? input.emoji.trim() : "";
  if (!emoji) return error(400, "emoji-required");
  if (emoji.length > 32) return error(400, "emoji-too-long");
  return withReactionContext(
    input,
    true,
    "reaction-toggle-failed",
    async (db) => {
      if (!(await hasComment(db, input.commentId, input.projectId, input.taskId)))
        return error(404, "comment-not-found");
      const actor = await resolveProjectMutationActor({ ...input, db });
      if (!actor.ok) return error(actor.status, actor.error);
      // Toggle and replacement are one transaction, serialized per comment.
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.commentId}, 0))`;
      const where = { commentId: input.commentId, ...actorWhere(input) };
      const existing = await db.taskCommentReaction.findMany({ where });
      const sameEmoji = existing.find((row) => row.emoji === emoji);
      if (sameEmoji) {
        await db.taskCommentReaction.delete({ where: { id: sameEmoji.id } });
      } else {
        if (existing.length) await db.taskCommentReaction.deleteMany({ where });
        await db.taskCommentReaction.create({
          data: {
            ...where,
            emoji,
            actorDisplayNameSnapshot: actor.actor.displayNameSnapshot.slice(
              0,
              80
            ),
          },
        });
      }
      await touchProjectActivity({ db, projectId: input.projectId });
      return readGroups(db, input.commentId, input);
    }
  );
}
export async function removeTaskCommentReaction(
  input: ActorInput & { reactionId: string }
): Promise<Result> {
  return withReactionContext(
    input,
    true,
    "reaction-remove-failed",
    async (db) => {
      const reaction = await db.taskCommentReaction.findUnique({
        where: { id: input.reactionId },
        include: { comment: { select: { id: true, taskId: true } } },
      });
      if (!reaction || reaction.commentId !== input.commentId || reaction.comment.taskId !== input.taskId) return error(404, "reaction-not-found");
      const task = await db.task.findUnique({
        where: { id: reaction.comment.taskId },
        select: { projectId: true },
      });
      if (!task || task.projectId !== input.projectId)
        return error(404, "reaction-not-found");
      if (!ownsReaction(reaction, input))
        return error(403, "not-reaction-owner");
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${reaction.commentId}, 0))`;
      await db.taskCommentReaction.deleteMany({
        where: { id: input.reactionId, ...actorWhere(input) },
      });
      await touchProjectActivity({ db, projectId: input.projectId });
      return readGroups(db, reaction.commentId, input);
    }
  );
}
