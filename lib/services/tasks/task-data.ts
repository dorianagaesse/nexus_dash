import { projectKanbanTaskInclude, type ProjectKanbanTaskRecord } from "./task-projections";
export { projectKanbanTaskInclude, type ProjectKanbanTaskRecord } from "./task-projections";
import { ARCHIVE_AFTER_MS } from "@/lib/archive-policy";
import { buildProjectPrincipalWhere } from "@/lib/services/project-access-service";
import type { DbClient } from "@/lib/services/rls-context";

export type TaskListAssigneeFilter =
  | "unassigned"
  | { kind: "human" | "agent"; id: string };

export interface TaskListFilters {
  epicId?: string;
  label?: string;
  assignee?: TaskListAssigneeFilter;
  sort?: "recent";
  limit?: number;
}

function buildStaleDoneTaskFilter(projectId: string, actorUserId: string) {
  const archiveThreshold = new Date(Date.now() - ARCHIVE_AFTER_MS);

  return {
    projectId,
    project: buildProjectPrincipalWhere(actorUserId),
    status: "Done" as const,
    archivedAt: null,
    OR: [
      { completedAt: { lte: archiveThreshold } },
      { completedAt: null, updatedAt: { lte: archiveThreshold } },
    ],
  };
}

export async function archiveStaleDoneTasks(
  projectId: string,
  actorUserId: string,
  db: DbClient
) {
  const staleDoneTaskFilter = buildStaleDoneTaskFilter(projectId, actorUserId);

  const staleDoneTask = await db.task.findFirst({
    where: staleDoneTaskFilter,
    select: { id: true },
  });

  if (staleDoneTask) {
    await db.task.updateMany({
      where: staleDoneTaskFilter,
      data: {
        archivedAt: new Date(),
      },
    });
  }
}

// Every helper receives the caller's actor-scoped transaction client.
export async function listProjectKanbanTaskRecords(
  db: DbClient, projectId: string, actorUserId: string, filters?: TaskListFilters
): Promise<ProjectKanbanTaskRecord[]> {
  const normalizedEpicId = filters?.epicId?.trim() || undefined;
  const normalizedLabel = filters?.label?.trim() || undefined;
  const normalizedAssignee = filters?.assignee;
  const normalizedSort = filters?.sort === "recent" ? "recent" : undefined;
  const normalizedLimit =
    typeof filters?.limit === "number" && Number.isFinite(filters.limit)
      ? Math.min(Math.max(Math.trunc(filters.limit), 1), 200)
      : undefined;
  const normalizedTake =
    normalizedLimit ?? (normalizedSort === "recent" ? 50 : undefined);

  const assigneeWhere =
    normalizedAssignee === "unassigned"
      ? { assigneeUserId: null, assigneeCredentialId: null }
      : normalizedAssignee
        ? normalizedAssignee.kind === "agent"
          ? { assigneeKind: "agent" as const, assigneeCredentialId: normalizedAssignee.id }
          : { assigneeKind: "human" as const, assigneeUserId: normalizedAssignee.id }
        : undefined;

    return db.task.findMany({
      where: {
        projectId,
        ...(normalizedEpicId ? { epicId: { equals: normalizedEpicId } } : {}),
        ...(normalizedLabel
          ? {
              OR: [
                {
                  label: { equals: normalizedLabel, mode: "insensitive" },
                },
                {
                  // Quoted-JSON containment can false-positive when a stored
                  // label itself contains an escaped quote (e.g. `My "Docs"`
                  // matches a `label=Docs` filter); revisit with the TASK-331
                  // vocabulary work.
                  labelsJson: {
                    contains: JSON.stringify(normalizedLabel),
                    mode: "insensitive",
                  },
                },
              ],
            }
          : {}),
        ...(assigneeWhere ?? {}),
        project: buildProjectPrincipalWhere(actorUserId),
      },
      orderBy:
        normalizedSort === "recent"
          ? [{ updatedAt: "desc" }]
          : [{ status: "asc" }, { position: "asc" }, { createdAt: "asc" }],
      ...(normalizedTake ? { take: normalizedTake } : {}),
      include: projectKanbanTaskInclude,
    });
}

export async function getProjectKanbanTaskRecord(
  db: DbClient, projectId: string, taskId: string, actorUserId: string
): Promise<ProjectKanbanTaskRecord | null> {
    return db.task.findFirst({
      where: {
        id: taskId,
        projectId,
        project: buildProjectPrincipalWhere(actorUserId),
      },
      include: projectKanbanTaskInclude,
    });
}
