import { richTextToPlainText } from "@/lib/rich-text";
import { formatTaskReference } from "@/lib/task-reference";
import { getTaskLabelsFromStorage } from "@/lib/task-label";
import { logServerError } from "@/lib/observability/logger";
import { requireProjectRole } from "@/lib/services/project-access-service";
import { withActorRlsContext } from "@/lib/services/rls-context";

const MAX_TASK_SEARCH_QUERY_LENGTH = 200;

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
}): Promise<ServiceResult<{ taskIds: string[] }>> {
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
          { archivedAt: "asc" },
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

      const normalizedQuery = normalizeSearchValue(query);
      const taskIds = tasks
        .filter((task) => {
          const assigneeTag =
            task.assigneeUser?.username &&
            task.assigneeUser.usernameDiscriminator
              ? `${task.assigneeUser.username}#${task.assigneeUser.usernameDiscriminator}`
              : null;
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
            ...task.comments.map((comment) => comment.content),
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

      return { ok: true, data: { taskIds } };
    });
  } catch (error) {
    logServerError("searchProjectTaskIds", error, { actorUserId, projectId });
    return createError(500, "task-search-failed");
  }
}
