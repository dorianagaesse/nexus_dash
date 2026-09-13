import type { Prisma } from "@prisma/client";

import {
  AGENT_ATTENTION_INVALID_CURSOR_ERROR,
  AGENT_ATTENTION_INVALID_FILTER_ERROR,
  buildAgentMeetingTodoAssignmentItemId,
  buildAgentMentionEventItemId,
  buildAgentTaskAssignmentItemId,
  compareAgentAttentionSortKeys,
  encodeAgentAttentionCursor,
  isAgentAttentionItemAfterCursor,
  type AgentAttentionAssignmentState,
  type AgentAttentionCursor,
  type AgentAttentionListFilters,
} from "@/lib/agent-attention";
import { logServerError } from "@/lib/observability/logger";
import type { ProjectActorSummary } from "@/lib/project-actor";
import {
  requireAgentProjectScopes,
  requireProjectRole,
  type AgentProjectAccessContext,
} from "@/lib/services/project-access-service";
import {
  loadProjectActorRegistry,
  mapStoredProjectActorFromRegistry,
  type ProjectActorRegistry,
} from "@/lib/services/project-actor-service";
import { mapTaskStoredActor } from "@/lib/services/project-task-response";
import { withActorRlsContext } from "@/lib/services/rls-context";
import {
  taskPersonSummarySelect,
  type TaskPersonRecord,
} from "@/lib/task-person";

export const AGENT_ATTENTION_REQUIRED_SCOPE = "attention:read" as const;

interface ServiceErrorResult {
  ok: false;
  status: number;
  error: string;
}

interface ServiceSuccessResult<T> {
  ok: true;
  data: T;
}

export type AgentAttentionServiceResult<T> =
  | ServiceSuccessResult<T>
  | ServiceErrorResult;

export interface AgentAttentionItemActor {
  kind: "human" | "agent";
  id: string;
  displayName: string;
  usernameTag: string | null;
}

export interface AgentAttentionMentionItem {
  id: string;
  eventType: "mention";
  projectId: string;
  occurredAt: Date;
  artifact: {
    type: "task_comment";
    id: string;
    taskId: string;
    taskTitle: string;
  };
  summary: string;
  actor: AgentAttentionItemActor;
  currentState: {
    status: string;
    archivedAt: Date | null;
  };
}

export type AgentAttentionAssignmentArtifact =
  | { type: "task"; id: string; title: string }
  | {
      type: "meeting_todo";
      id: string;
      content: string;
      meetingNoteId: string;
      meetingNoteTitle: string;
    };

export interface AgentAttentionAssignmentItem {
  id: string;
  eventType: "assignment";
  projectId: string;
  occurredAt: Date | null;
  artifact: AgentAttentionAssignmentArtifact;
  summary: string;
  actor: AgentAttentionItemActor | null;
  currentState: {
    assignmentState: AgentAttentionAssignmentState;
    status: string;
    archivedAt: Date | null;
  };
}

export interface AgentAttentionListResult<TItem> {
  items: TItem[];
  nextCursor: string | null;
}

function createError(status: number, error: string): ServiceErrorResult {
  return { ok: false, status, error };
}

function normalizeIdentifier(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatAgentDisplayName(label: string | null | undefined): string {
  const normalizedLabel = normalizeIdentifier(label);
  return normalizedLabel ? `${normalizedLabel} (agent)` : "Agent";
}

interface AgentAttentionServiceInput {
  actorUserId: string;
  projectId: string;
  agentAccess?: AgentProjectAccessContext;
  filters: AgentAttentionListFilters;
}

type AgentAttentionAccessResult =
  | { ok: true; credentialId: string }
  | ServiceErrorResult;

function resolveAgentAttentionAccess(
  input: AgentAttentionServiceInput
): AgentAttentionAccessResult {
  const actorUserId = normalizeIdentifier(input.actorUserId);
  if (!actorUserId) {
    return createError(401, "unauthorized");
  }

  if (!input.agentAccess) {
    return createError(403, "forbidden");
  }

  const agentScopeAccess = requireAgentProjectScopes({
    agentAccess: input.agentAccess,
    projectId: input.projectId,
    requiredScopes: [AGENT_ATTENTION_REQUIRED_SCOPE],
  });
  if (!agentScopeAccess.ok) {
    return createError(agentScopeAccess.status, agentScopeAccess.error);
  }

  return { ok: true, credentialId: input.agentAccess.credentialId };
}

function mapItemActor(
  summary: ProjectActorSummary | null
): AgentAttentionItemActor | null {
  if (!summary) {
    return null;
  }

  if (summary.kind === "agent") {
    return {
      kind: "agent",
      id: summary.id,
      displayName: formatAgentDisplayName(summary.displayName),
      usernameTag: null,
    };
  }

  return {
    kind: "human",
    id: summary.id,
    displayName: summary.displayName,
    usernameTag: summary.usernameTag,
  };
}

function buildOccurredAtRange(
  filters: AgentAttentionListFilters
): Prisma.DateTimeFilter | undefined {
  if (!filters.since && !filters.until) {
    return undefined;
  }

  return {
    ...(filters.since ? { gte: filters.since } : {}),
    ...(filters.until ? { lte: filters.until } : {}),
  };
}

function buildMentionCursorWhereClause(input: {
  filters: AgentAttentionListFilters;
}): Prisma.TaskCommentAgentMentionWhereInput | null {
  const cursor = input.filters.cursor;
  if (!cursor || !cursor.occurredAt) {
    return null;
  }

  return input.filters.order === "desc"
    ? {
        OR: [
          { createdAt: { lt: cursor.occurredAt } },
          { createdAt: cursor.occurredAt, id: { lt: cursor.id } },
        ],
      }
    : {
        OR: [
          { createdAt: { gt: cursor.occurredAt } },
          { createdAt: cursor.occurredAt, id: { gt: cursor.id } },
        ],
      };
}

// The assignment sources paginate independently with keyset predicates that
// mirror isAgentAttentionItemAfterCursor: ties break on the raw row id and
// null assignment times sort as oldest (first in asc, last in desc).
function buildTaskAssignmentCursorWhereClause(input: {
  cursor: AgentAttentionCursor;
  order: AgentAttentionListFilters["order"];
}): Prisma.TaskWhereInput {
  const { cursor, order } = input;
  if (order === "desc") {
    return cursor.occurredAt
      ? {
          OR: [
            { assigneeAssignedAt: null },
            { assigneeAssignedAt: { lt: cursor.occurredAt } },
            { assigneeAssignedAt: cursor.occurredAt, id: { lt: cursor.id } },
          ],
        }
      : { assigneeAssignedAt: null, id: { lt: cursor.id } };
  }
  return cursor.occurredAt
    ? {
        OR: [
          { assigneeAssignedAt: { gt: cursor.occurredAt } },
          { assigneeAssignedAt: cursor.occurredAt, id: { gt: cursor.id } },
        ],
      }
    : {
        OR: [
          { assigneeAssignedAt: null, id: { gt: cursor.id } },
          { assigneeAssignedAt: { not: null } },
        ],
      };
}

function buildMeetingTodoAssignmentCursorWhereClause(input: {
  cursor: AgentAttentionCursor;
  order: AgentAttentionListFilters["order"];
}): Prisma.ProjectMeetingNoteActionWhereInput {
  const { cursor, order } = input;
  if (order === "desc") {
    return cursor.occurredAt
      ? {
          OR: [
            { assignedAt: null },
            { assignedAt: { lt: cursor.occurredAt } },
            { assignedAt: cursor.occurredAt, id: { lt: cursor.id } },
          ],
        }
      : { assignedAt: null, id: { lt: cursor.id } };
  }
  return cursor.occurredAt
    ? {
        OR: [
          { assignedAt: { gt: cursor.occurredAt } },
          { assignedAt: cursor.occurredAt, id: { gt: cursor.id } },
        ],
      }
    : {
        OR: [
          { assignedAt: null, id: { gt: cursor.id } },
          { assignedAt: { not: null } },
        ],
      };
}

export async function listAgentMentionEvents(
  input: AgentAttentionServiceInput
): Promise<
  AgentAttentionServiceResult<AgentAttentionListResult<AgentAttentionMentionItem>>
> {
  const access = resolveAgentAttentionAccess(input);
  if (!access.ok) {
    return access;
  }

  const { filters } = input;
  if (filters.eventType && filters.eventType !== "mention") {
    return createError(400, AGENT_ATTENTION_INVALID_FILTER_ERROR);
  }
  if (filters.artifactType && filters.artifactType !== "task_comment") {
    return createError(400, AGENT_ATTENTION_INVALID_FILTER_ERROR);
  }
  if (filters.state) {
    return createError(400, AGENT_ATTENTION_INVALID_FILTER_ERROR);
  }
  // Mention rows always carry a created time, so a cursor without one was
  // never minted by this endpoint; re-serving the first page would silently
  // duplicate items.
  if (filters.cursor && !filters.cursor.occurredAt) {
    return createError(400, AGENT_ATTENTION_INVALID_CURSOR_ERROR);
  }

  const actorUserId = normalizeIdentifier(input.actorUserId);

  return withActorRlsContext(actorUserId, async (db) => {
    const projectAccess = await requireProjectRole({
      actorUserId,
      projectId: input.projectId,
      minimumRole: "viewer",
      db,
    });
    if (!projectAccess.ok) {
      return createError(projectAccess.status, projectAccess.error);
    }

    try {
      const occurredAtRange = buildOccurredAtRange(filters);
      const cursorWhere = buildMentionCursorWhereClause({ filters });

      const mentions = await db.taskCommentAgentMention.findMany({
        where: {
          agentCredentialId: access.credentialId,
          task: { projectId: input.projectId },
          ...(occurredAtRange ? { createdAt: occurredAtRange } : {}),
          ...(cursorWhere ?? {}),
        },
        orderBy: [{ createdAt: filters.order }, { id: filters.order }],
        take: filters.limit + 1,
        select: {
          id: true,
          createdAt: true,
          commentId: true,
          taskId: true,
          agentCredentialId: true,
          agentLabel: true,
          createdByUserId: true,
          createdByCredentialId: true,
          createdByCredentialLabel: true,
          task: {
            select: {
              id: true,
              title: true,
              status: true,
              archivedAt: true,
            },
          },
          createdByUser: {
            select: taskPersonSummarySelect,
          },
        },
      });

      const registry = await loadProjectActorRegistry({
        db,
        projectId: input.projectId,
      });
      const registrySelfLabel =
        registry?.credentialById.get(access.credentialId)?.displayName ?? null;

      const hasNextPage = mentions.length > filters.limit;
      const pageRows = hasNextPage ? mentions.slice(0, filters.limit) : mentions;

      const items: AgentAttentionMentionItem[] = pageRows.map((mention) => {
        // The credential id is set null when a credential is deleted while
        // the label snapshot survives, so the snapshot alone still marks an
        // agent author (same rule as mapTaskAuthorRecord).
        const actorIsAgent = Boolean(
          mention.createdByCredentialId || mention.createdByCredentialLabel
        );
        const actorSummary = mapStoredProjectActorFromRegistry({
          kind: actorIsAgent ? "agent" : "human",
          id: actorIsAgent
            ? mention.createdByCredentialId
            : mention.createdByUserId,
          displayNameSnapshot: mention.createdByCredentialLabel,
          user: mention.createdByUser,
          registry,
        });
        const actor = mapItemActor(actorSummary);
        const actorDisplayName = actor?.displayName ?? "Unknown actor";
        const mentionedCredentialDisplayName = formatAgentDisplayName(
          registrySelfLabel ?? mention.agentLabel
        );

        return {
          id: buildAgentMentionEventItemId(mention.id),
          eventType: "mention",
          projectId: input.projectId,
          occurredAt: mention.createdAt,
          artifact: {
            type: "task_comment",
            id: mention.commentId,
            taskId: mention.taskId,
            taskTitle: mention.task.title,
          },
          summary: `${actorDisplayName} mentioned ${mentionedCredentialDisplayName} in a comment on "${mention.task.title}"`,
          actor: actor ?? {
            kind: "human",
            id: mention.createdByUserId,
            displayName: "Unknown actor",
            usernameTag: null,
          },
          currentState: {
            status: mention.task.status,
            archivedAt: mention.task.archivedAt,
          },
        };
      });

      const lastPageRow = pageRows[pageRows.length - 1];
      // The mention cursor keys the SQL tie-break off the raw row id, while
      // items expose the prefixed `mention:<id>` key. Raw id it is.
      const nextCursor =
        hasNextPage && lastPageRow
          ? encodeAgentAttentionCursor({
              order: filters.order,
              occurredAt: lastPageRow.createdAt,
              id: lastPageRow.id,
            })
          : null;

      return { ok: true as const, data: { items, nextCursor } };
    } catch (error) {
      logServerError("listAgentMentionEvents", error, {
        projectId: input.projectId,
        credentialId: access.credentialId,
      });
      return createError(500, "agent-attention-list-failed");
    }
  });
}

export async function listAgentAssignments(
  input: AgentAttentionServiceInput
): Promise<
  AgentAttentionServiceResult<
    AgentAttentionListResult<AgentAttentionAssignmentItem>
  >
> {
  const access = resolveAgentAttentionAccess(input);
  if (!access.ok) {
    return access;
  }

  const { filters } = input;
  if (filters.eventType && filters.eventType !== "assignment") {
    return createError(400, AGENT_ATTENTION_INVALID_FILTER_ERROR);
  }
  if (
    filters.artifactType &&
    filters.artifactType !== "task" &&
    filters.artifactType !== "meeting_todo"
  ) {
    return createError(400, AGENT_ATTENTION_INVALID_FILTER_ERROR);
  }

  const actorUserId = normalizeIdentifier(input.actorUserId);
  const includeTasks = !filters.artifactType || filters.artifactType === "task";
  const includeMeetingTodos =
    !filters.artifactType || filters.artifactType === "meeting_todo";
  const taskStateWhere: Prisma.TaskWhereInput = filters.state
    ? filters.state === "completed"
      ? { status: "Done" }
      : { status: { not: "Done" } }
    : {};
  const meetingTodoStateWhere: Prisma.ProjectMeetingNoteActionWhereInput =
    filters.state === "completed"
      ? { completedAt: { not: null } }
      : filters.state === "active"
        ? { completedAt: null }
        : {};

  return withActorRlsContext(actorUserId, async (db) => {
    const projectAccess = await requireProjectRole({
      actorUserId,
      projectId: input.projectId,
      minimumRole: "viewer",
      db,
    });
    if (!projectAccess.ok) {
      return createError(projectAccess.status, projectAccess.error);
    }

    try {
      const occurredAtRange = buildOccurredAtRange(filters);
      const taskCursorWhere = filters.cursor
        ? buildTaskAssignmentCursorWhereClause({
            cursor: filters.cursor,
            order: filters.order,
          })
        : null;
      const meetingTodoCursorWhere = filters.cursor
        ? buildMeetingTodoAssignmentCursorWhereClause({
            cursor: filters.cursor,
            order: filters.order,
          })
        : null;
      // Nulls sort as oldest, which deviates from PostgreSQL's defaults in
      // both directions, so both orderBy clauses pin the null policy.
      const occurredAtNulls = filters.order === "asc" ? "first" : "last";

      const [tasks, meetingTodos, registry] = await Promise.all([
        includeTasks
          ? db.task.findMany({
              where: {
                projectId: input.projectId,
                assigneeCredentialId: access.credentialId,
                ...(occurredAtRange
                  ? { assigneeAssignedAt: occurredAtRange }
                  : {}),
                ...taskStateWhere,
                ...(taskCursorWhere ?? {}),
              },
              orderBy: [
                {
                  assigneeAssignedAt: {
                    sort: filters.order,
                    nulls: occurredAtNulls,
                  },
                },
                { id: filters.order },
              ],
              take: filters.limit + 1,
              select: {
                id: true,
                title: true,
                status: true,
                archivedAt: true,
                assigneeAssignedAt: true,
                assigneeAssignedByKind: true,
                assigneeAssignedByUserId: true,
                assigneeAssignedByCredentialId: true,
                assigneeAssignedByDisplayNameSnapshot: true,
                assigneeAssignedByUser: {
                  select: taskPersonSummarySelect,
                },
                assigneeDisplayNameSnapshot: true,
              },
            })
          : Promise.resolve([]),
        includeMeetingTodos
          ? db.projectMeetingNoteAction.findMany({
              where: {
                assigneeCredentialId: access.credentialId,
                meetingNote: { projectId: input.projectId },
                ...(occurredAtRange ? { assignedAt: occurredAtRange } : {}),
                ...meetingTodoStateWhere,
                ...(meetingTodoCursorWhere ?? {}),
              },
              orderBy: [
                {
                  assignedAt: {
                    sort: filters.order,
                    nulls: occurredAtNulls,
                  },
                },
                { id: filters.order },
              ],
              take: filters.limit + 1,
              select: {
                id: true,
                content: true,
                completedAt: true,
                assignedAt: true,
                meetingNoteId: true,
                assignedByKind: true,
                assignedByUserId: true,
                assignedByCredentialId: true,
                assignedByDisplayNameSnapshot: true,
                assigneeDisplayNameSnapshot: true,
                assignedByUser: {
                  select: taskPersonSummarySelect,
                },
                meetingNote: {
                  select: { id: true, title: true },
                },
              },
            })
          : Promise.resolve([]),
        loadProjectActorRegistry({ db, projectId: input.projectId }),
      ]);

      const registrySelfLabel =
        registry?.credentialById.get(access.credentialId)?.displayName ?? null;

      // Sort and cursor keys use the raw row id so they line up with the
      // per-source keyset predicates; items keep their prefixed dedup key.
      interface AssignmentCandidate {
        sortKey: { occurredAt: Date | null; id: string };
        item: AgentAttentionAssignmentItem;
      }

      const candidates: AssignmentCandidate[] = [
        ...tasks.map((task): AssignmentCandidate => {
          const actor = mapItemActor(
            mapTaskStoredActor({
              kind: task.assigneeAssignedByKind,
              userId: task.assigneeAssignedByUserId,
              credentialId: task.assigneeAssignedByCredentialId,
              displayNameSnapshot: task.assigneeAssignedByDisplayNameSnapshot,
              user: task.assigneeAssignedByUser,
              registry,
            })
          );
          const assignmentState: AgentAttentionAssignmentState =
            task.status === "Done" ? "completed" : "active";

          return {
            sortKey: { occurredAt: task.assigneeAssignedAt, id: task.id },
            item: {
              id: buildAgentTaskAssignmentItemId(task.id),
              eventType: "assignment",
              projectId: input.projectId,
              occurredAt: task.assigneeAssignedAt,
              artifact: {
                type: "task",
                id: task.id,
                title: task.title,
              },
              summary: `${actor?.displayName ?? "Unknown actor"} assigned ${formatAgentDisplayName(
                registrySelfLabel ?? task.assigneeDisplayNameSnapshot
              )} to task "${task.title}"`,
              actor,
              currentState: {
                assignmentState,
                status: task.status,
                archivedAt: task.archivedAt,
              },
            },
          };
        }),
        ...meetingTodos.map((todo): AssignmentCandidate => {
          const actor = mapItemActor(
            mapTaskStoredActor({
              kind: todo.assignedByKind,
              userId: todo.assignedByUserId,
              credentialId: todo.assignedByCredentialId,
              displayNameSnapshot: todo.assignedByDisplayNameSnapshot,
              user: todo.assignedByUser,
              registry,
            })
          );
          const assignmentState: AgentAttentionAssignmentState = todo.completedAt
            ? "completed"
            : "active";

          return {
            sortKey: { occurredAt: todo.assignedAt, id: todo.id },
            item: {
              id: buildAgentMeetingTodoAssignmentItemId(todo.id),
              eventType: "assignment",
              projectId: input.projectId,
              occurredAt: todo.assignedAt,
              artifact: {
                type: "meeting_todo",
                id: todo.id,
                content: todo.content,
                meetingNoteId: todo.meetingNoteId,
                meetingNoteTitle: todo.meetingNote.title,
              },
              summary: `${actor?.displayName ?? "Unknown actor"} assigned ${formatAgentDisplayName(
                registrySelfLabel ?? todo.assigneeDisplayNameSnapshot
              )} to the meeting to-do "${todo.content}" in "${todo.meetingNote.title}"`,
              actor,
              currentState: {
                assignmentState,
                status: assignmentState === "completed" ? "completed" : "open",
                archivedAt: null,
              },
            },
          };
        }),
      ];

      const sortedCandidates = candidates.sort((left, right) =>
        compareAgentAttentionSortKeys(left.sortKey, right.sortKey, filters.order)
      );
      const cursor = filters.cursor;
      const cursorFilteredCandidates = cursor
        ? sortedCandidates.filter((candidate) =>
            isAgentAttentionItemAfterCursor(
              candidate.sortKey,
              cursor,
              filters.order
            )
          )
        : sortedCandidates;
      const hasNextPage = cursorFilteredCandidates.length > filters.limit;
      const pageCandidates = hasNextPage
        ? cursorFilteredCandidates.slice(0, filters.limit)
        : cursorFilteredCandidates;
      const lastPageCandidate = pageCandidates[pageCandidates.length - 1];
      const nextCursor =
        hasNextPage && lastPageCandidate
          ? encodeAgentAttentionCursor({
              order: filters.order,
              occurredAt: lastPageCandidate.sortKey.occurredAt,
              id: lastPageCandidate.sortKey.id,
            })
          : null;

      return {
        ok: true as const,
        data: {
          items: pageCandidates.map((candidate) => candidate.item),
          nextCursor,
        },
      };
    } catch (error) {
      logServerError("listAgentAssignments", error, {
        projectId: input.projectId,
        credentialId: access.credentialId,
      });
      return createError(500, "agent-attention-list-failed");
    }
  });
}

export interface AgentAttentionItemResponse {
  id: string;
  eventType: string;
  projectId: string;
  occurredAt: string | null;
  artifact: AgentAttentionAssignmentArtifact | AgentAttentionMentionItem["artifact"];
  summary: string;
  actor: AgentAttentionItemActor | null;
  currentState: {
    assignmentState?: AgentAttentionAssignmentState;
    status: string;
    archivedAt: string | null;
  };
}

function mapAttentionItemBase(item: {
  id: string;
  eventType: string;
  projectId: string;
  occurredAt: Date | null;
  summary: string;
  actor: AgentAttentionItemActor | null;
}): Pick<
  AgentAttentionItemResponse,
  "id" | "eventType" | "projectId" | "occurredAt" | "summary" | "actor"
> {
  return {
    id: item.id,
    eventType: item.eventType,
    projectId: item.projectId,
    occurredAt: item.occurredAt ? item.occurredAt.toISOString() : null,
    summary: item.summary,
    actor: item.actor,
  };
}

export function mapAgentMentionItemToResponse(
  item: AgentAttentionMentionItem
): AgentAttentionItemResponse {
  return {
    ...mapAttentionItemBase(item),
    artifact: { ...item.artifact },
    currentState: {
      status: item.currentState.status,
      archivedAt: item.currentState.archivedAt
        ? item.currentState.archivedAt.toISOString()
        : null,
    },
  };
}

export function mapAgentAssignmentItemToResponse(
  item: AgentAttentionAssignmentItem
): AgentAttentionItemResponse {
  return {
    ...mapAttentionItemBase(item),
    artifact: { ...item.artifact },
    currentState: {
      assignmentState: item.currentState.assignmentState,
      status: item.currentState.status,
      archivedAt: item.currentState.archivedAt
        ? item.currentState.archivedAt.toISOString()
        : null,
    },
  };
}
