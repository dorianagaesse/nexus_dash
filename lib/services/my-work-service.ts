import type { Prisma } from "@prisma/client";

import type { MeetingTodoActorSummary } from "@/lib/meeting-todo-actor";
import { buildProjectPrincipalWhere } from "@/lib/services/project-access-service";
import { mapStoredMeetingTodoActor } from "@/lib/services/project-meeting-todo-actor-service";
import { withActorRlsContext } from "@/lib/services/rls-context";
import { taskPersonSummarySelect } from "@/lib/task-person";

export const MY_WORK_TYPE_FILTERS = ["all", "task", "todo"] as const;

export type MyWorkTypeFilter = (typeof MY_WORK_TYPE_FILTERS)[number];

export function isMyWorkTypeFilter(value: string): value is MyWorkTypeFilter {
  return (MY_WORK_TYPE_FILTERS as readonly string[]).includes(value);
}

export const MY_WORK_SORTS = ["recent", "oldest"] as const;

export type MyWorkSort = (typeof MY_WORK_SORTS)[number];

export function isMyWorkSort(value: string): value is MyWorkSort {
  return (MY_WORK_SORTS as readonly string[]).includes(value);
}

export type MyWorkItemType = "task" | "todo";

export interface MyWorkItem {
  id: string;
  type: MyWorkItemType;
  title: string;
  projectId: string;
  projectName: string;
  status: string;
  actor: MeetingTodoActorSummary | null;
  timestamp: Date;
  href: string;
}

export interface MyWorkTypeCounts {
  all: number;
  task: number;
  todo: number;
}

export interface MyWorkProjectOption {
  id: string;
  name: string;
  count: number;
}

export interface MyWorkResult {
  items: MyWorkItem[];
  total: number;
  truncated: boolean;
  typeCounts: MyWorkTypeCounts;
  projects: MyWorkProjectOption[];
}

export const MY_WORK_TYPE_LIMIT = 200;

const taskMyWorkSelect = {
  id: true,
  title: true,
  status: true,
  updatedAt: true,
  projectId: true,
  assigneeKind: true,
  assigneeUserId: true,
  assigneeDisplayNameSnapshot: true,
  assigneeUser: { select: taskPersonSummarySelect },
  project: { select: { id: true, name: true } },
} as const;

const todoMyWorkSelect = {
  id: true,
  content: true,
  completedAt: true,
  updatedAt: true,
  assigneeKind: true,
  assigneeUserId: true,
  assigneeDisplayNameSnapshot: true,
  assigneeUser: { select: taskPersonSummarySelect },
  meetingNote: {
    select: {
      projectId: true,
      project: { select: { id: true, name: true } },
    },
  },
} as const;

type TaskMyWorkRow = Prisma.TaskGetPayload<{ select: typeof taskMyWorkSelect }>;

function normalizeIdentifier(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

// Rows are scoped to work assigned to the acting user, so the assignee
// always resolves to that user's live identity.
function resolveSelfActor(row: {
  assigneeKind: string | null;
  assigneeUserId: string | null;
  assigneeDisplayNameSnapshot: string | null;
  assigneeUser: TaskMyWorkRow["assigneeUser"];
}): MeetingTodoActorSummary | null {
  if (row.assigneeKind !== "human") {
    return null;
  }
  return mapStoredMeetingTodoActor({
    kind: "human",
    id: row.assigneeUserId,
    displayNameSnapshot: row.assigneeDisplayNameSnapshot,
    user: row.assigneeUser,
    isCurrentProjectHuman: true,
  });
}

export async function listMyWork(input: {
  actorUserId: string;
  type: MyWorkTypeFilter;
  projectId: string | null;
  query: string;
  sort: MyWorkSort;
}): Promise<MyWorkResult | null> {
  const actorUserId = normalizeIdentifier(input.actorUserId);
  if (!actorUserId) {
    return null;
  }
  const { type, sort } = input;
  const projectId = normalizeIdentifier(input.projectId) || null;
  const query = input.query.trim().toLowerCase();
  const fetchTake = MY_WORK_TYPE_LIMIT + 1;

  return withActorRlsContext(actorUserId, async (db) => {
    const principalWhere = buildProjectPrincipalWhere(actorUserId);
    const [taskRows, todoRows] = await Promise.all([
      db.task.findMany({
        where: {
          archivedAt: null,
          assigneeKind: "human",
          assigneeUserId: actorUserId,
          status: { not: "Done" },
          project: principalWhere,
        },
        orderBy: [{ updatedAt: "desc" }],
        take: fetchTake,
        select: taskMyWorkSelect,
      }),
      db.projectMeetingNoteAction.findMany({
        where: {
          completedAt: null,
          assigneeKind: "human",
          assigneeUserId: actorUserId,
          meetingNote: { project: principalWhere },
        },
        orderBy: [{ updatedAt: "desc" }],
        take: fetchTake,
        select: todoMyWorkSelect,
      }),
    ]);

    const taskItems: MyWorkItem[] = taskRows.map((row) => ({
      id: row.id,
      type: "task",
      title: row.title,
      projectId: row.project.id,
      projectName: row.project.name,
      status: row.status,
      actor: resolveSelfActor(row),
      timestamp: row.updatedAt,
      href: `/projects/${row.project.id}?taskId=${row.id}`,
    }));

    const todoItems: MyWorkItem[] = todoRows.map((row) => ({
      id: row.id,
      type: "todo",
      title: row.content,
      projectId: row.meetingNote.projectId,
      projectName: row.meetingNote.project.name,
      status: row.completedAt ? "Done" : "Open",
      actor: resolveSelfActor(row),
      timestamp: row.updatedAt,
      href: `/projects/${row.meetingNote.projectId}/todos`,
    }));

    // Each type is fetched newest-first and capped per type, so heavier
    // types cannot crowd others out of the merged list.
    const scopeItems = (list: MyWorkItem[]) => list.slice(0, MY_WORK_TYPE_LIMIT);
    const stateItems = [...scopeItems(taskItems), ...scopeItems(todoItems)];

    const typeCounts: MyWorkTypeCounts = {
      all: stateItems.length,
      task: stateItems.filter((item) => item.type === "task").length,
      todo: stateItems.filter((item) => item.type === "todo").length,
    };

    const projectCounts = new Map<string, MyWorkProjectOption>();
    for (const item of stateItems) {
      const option = projectCounts.get(item.projectId);
      if (option) {
        option.count += 1;
      } else {
        projectCounts.set(item.projectId, {
          id: item.projectId,
          name: item.projectName,
          count: 1,
        });
      }
    }
    const projects = [...projectCounts.values()].sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    const items = stateItems
      .filter((item) => type === "all" || item.type === type)
      .filter((item) => !projectId || item.projectId === projectId)
      .filter(
        (item) => !query || item.title.toLowerCase().includes(query)
      )
      .sort((a, b) =>
        sort === "oldest"
          ? a.timestamp.getTime() - b.timestamp.getTime()
          : b.timestamp.getTime() - a.timestamp.getTime()
      );

    return {
      items,
      total: items.length,
      truncated:
        taskRows.length > MY_WORK_TYPE_LIMIT ||
        todoRows.length > MY_WORK_TYPE_LIMIT,
      typeCounts,
      projects,
    };
  });
}
