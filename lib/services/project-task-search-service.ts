import { richTextToPlainText } from "@/lib/rich-text";
import { formatTaskReference } from "@/lib/task-reference";
import { getTaskLabelsFromStorage } from "@/lib/task-label";
import { logServerError } from "@/lib/observability/logger";
import { loadProjectActorRegistry } from "@/lib/services/project-actor-service";
import {
  requireAgentProjectScopes,
  requireProjectRole,
  type AgentProjectAccessContext,
} from "@/lib/services/project-access-service";
import { withActorRlsContext } from "@/lib/services/rls-context";

const MAX_TASK_SEARCH_QUERY_LENGTH = 200;

export const AGENT_TASK_SEARCH_DEFAULT_LIMIT = 50;
export const MAX_TASK_SEARCH_LIMIT = 200;

export interface ProjectTaskSearchResult {
  taskIds: string[];
  totalMatches: number;
  truncated: boolean;
}

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

function createError(status: number, error: string): ServiceErrorResult {
  return { ok: false, status, error };
}

function normalizeSearchValue(value: string | null | undefined): string {
  return value?.toLocaleLowerCase().trim() ?? "";
}

export function isTaskSearchQueryValid(query: string): boolean {
  const normalizedQuery = query.trim();
  return (
    normalizedQuery.length >= 1 &&
    normalizedQuery.length <= MAX_TASK_SEARCH_QUERY_LENGTH
  );
}

export async function searchProjectTaskIds(input: {
  actorUserId: string;
  projectId: string;
  query: string;
  agentAccess?: AgentProjectAccessContext | null;
  limit?: number | null;
}): Promise<ServiceResult<ProjectTaskSearchResult>> {
  const actorUserId = input.actorUserId.trim();
  const projectId = input.projectId.trim();
  const query = input.query.trim();

  if (!actorUserId) {
    return createError(401, "unauthorized");
  }
  if (!projectId) {
    return createError(400, "project-required");
  }
  if (!query) {
    return createError(400, "query-required");
  }
  if (!isTaskSearchQueryValid(query)) {
    return createError(400, "query-too-long");
  }

  const agentScopeAccess = requireAgentProjectScopes({
    agentAccess: input.agentAccess,
    projectId,
    requiredScopes: ["task:read"],
  });
  if (!agentScopeAccess.ok) {
    return createError(agentScopeAccess.status, agentScopeAccess.error);
  }

  const normalizedLimit =
    typeof input.limit === "number" && Number.isFinite(input.limit)
      ? Math.min(Math.max(Math.trunc(input.limit), 1), MAX_TASK_SEARCH_LIMIT)
      : null;
  // Agent credentials are always bounded; session callers stay unbounded
  // unless they pass an explicit limit, which keeps the kanban UI unchanged.
  const effectiveLimit =
    normalizedLimit ??
    (input.agentAccess ? AGENT_TASK_SEARCH_DEFAULT_LIMIT : null);

  try {
    return await withActorRlsContext(actorUserId, async (db) => {
      const access = await requireProjectRole({
        actorUserId,
        projectId,
        minimumRole: "viewer",
        db,
      });
      if (!access.ok) {
        return createError(access.status, access.error);
      }

      const tasks = await db.task.findMany({
        where: { projectId },
        orderBy: [
          // Postgres ASC defaults to NULLS LAST, so archived rows would
          // precede active ones and the bounded agent slice could drop
          // active matches entirely.
          { archivedAt: { sort: "asc", nulls: "first" } },
          { status: "asc" },
          { position: "asc" },
          { createdAt: "asc" },
        ],
        select: {
          id: true,
          referenceNumber: true,
          title: true,
          description: true,
          status: true,
          label: true,
          labelsJson: true,
          blockedNote: true,
          comments: { select: { content: true } },
          epic: { select: { name: true } },
          assigneeKind: true,
          assigneeCredentialId: true,
          assigneeDisplayNameSnapshot: true,
          assigneeUser: {
            select: {
              name: true,
              username: true,
              usernameDiscriminator: true,
            },
          },
          blockedFollowUps: { select: { content: true } },
          attachments: { select: { name: true } },
          outgoingRelations: {
            select: { rightTask: { select: { title: true } } },
          },
          incomingRelations: {
            select: { leftTask: { select: { title: true } } },
          },
        },
      });

      const actorRegistry = await loadProjectActorRegistry({ db, projectId });
      const normalizedQuery = normalizeSearchValue(query);
      const matchedTaskIds = tasks
        .filter((task) => {
          const assigneeTag =
            task.assigneeUser?.username &&
            task.assigneeUser.usernameDiscriminator
              ? `${task.assigneeUser.username}#${task.assigneeUser.usernameDiscriminator}`
              : null;
          // Agent-assigned tasks stay findable by credential label even after
          // revocation, so stale work can be discovered and reassigned.
          const agentAssigneeValues =
            task.assigneeKind === "agent"
              ? [
                  task.assigneeDisplayNameSnapshot,
                  task.assigneeCredentialId
                    ? actorRegistry?.credentialById.get(task.assigneeCredentialId)
                        ?.displayName ?? null
                    : null,
                ]
              : [];
          const searchableValues = [
            task.title,
            task.description ? richTextToPlainText(task.description) : null,
            formatTaskReference(task.referenceNumber),
            task.status,
            task.blockedNote,
            ...getTaskLabelsFromStorage(task.labelsJson, task.label),
            task.epic?.name,
            task.assigneeUser?.name,
            task.assigneeUser?.username,
            assigneeTag,
            ...agentAssigneeValues,
            ...task.comments.map((comment) =>
              richTextToPlainText(comment.content)
            ),
            ...task.blockedFollowUps.map((entry) => entry.content),
            ...task.attachments.map((attachment) => attachment.name),
            ...task.outgoingRelations.map((relation) => relation.rightTask.title),
            ...task.incomingRelations.map((relation) => relation.leftTask.title),
          ];

          return searchableValues.some((value) =>
            normalizeSearchValue(value).includes(normalizedQuery)
          );
        })
        .map((task) => task.id);

      const taskIds =
        effectiveLimit === null
          ? matchedTaskIds
          : matchedTaskIds.slice(0, effectiveLimit);

      return {
        ok: true,
        data: {
          taskIds,
          totalMatches: matchedTaskIds.length,
          truncated: taskIds.length < matchedTaskIds.length,
        },
      };
    });
  } catch (error) {
    logServerError("searchProjectTaskIds", error, { actorUserId, projectId });
    return createError(500, "task-search-failed");
  }
}
