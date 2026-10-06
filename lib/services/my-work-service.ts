import type { Prisma } from "@prisma/client";

import {
  getMeetingTodoParticipantNameKey,
  type MeetingTodoActorSummary,
} from "@/lib/meeting-todo-actor";
import {
  loadProjectActorRegistry,
  type ProjectActorRegistry,
} from "@/lib/services/project-actor-service";
import { buildProjectPrincipalWhere } from "@/lib/services/project-access-service";
import { mapStoredMeetingTodoActor } from "@/lib/services/project-meeting-todo-actor-service";
import { type DbClient, withActorRlsContext } from "@/lib/services/rls-context";
import { taskPersonSummarySelect } from "@/lib/task-person";

export const MY_WORK_ASSIGNMENT_FILTERS = [
  "mine",
  "unassigned",
  "reassignment",
  "all",
] as const;

export type MyWorkAssignmentFilter =
  (typeof MY_WORK_ASSIGNMENT_FILTERS)[number];

export function isMyWorkAssignmentFilter(
  value: string
): value is MyWorkAssignmentFilter {
  return (MY_WORK_ASSIGNMENT_FILTERS as readonly string[]).includes(value);
}

export const MY_WORK_TYPE_FILTERS = ["all", "task", "todo", "note"] as const;

export type MyWorkTypeFilter = (typeof MY_WORK_TYPE_FILTERS)[number];

export function isMyWorkTypeFilter(
  value: string
): value is MyWorkTypeFilter {
  return (MY_WORK_TYPE_FILTERS as readonly string[]).includes(value);
}

export const MY_WORK_SORTS = ["recent", "oldest"] as const;

export type MyWorkSort = (typeof MY_WORK_SORTS)[number];

export function isMyWorkSort(value: string): value is MyWorkSort {
  return (MY_WORK_SORTS as readonly string[]).includes(value);
}

export type MyWorkItemType = "task" | "todo" | "note";

export interface MyWorkItem {
  id: string;
  type: MyWorkItemType;
  title: string;
  projectId: string;
  projectName: string;
  status: string;
  actor: MeetingTodoActorSummary | null;
  needsReassignment: boolean;
  timestamp: Date;
  href: string;
}

export interface MyWorkTypeCounts {
  all: number;
  task: number;
  todo: number;
  note: number;
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

// Bounds registry lookups (one RPC per project) when an account spans many
// projects; skipped registries only lose live actor status, not row visibility.
const PROJECT_REGISTRY_LIMIT = 50;

const NOTE_STATUS_LABELS: Record<string, string> = {
  prepared: "Prepared",
  actions_in_progress: "Actions in progress",
  done: "Done",
};

const taskMyWorkSelect = {
  id: true,
  title: true,
  status: true,
  updatedAt: true,
  projectId: true,
  assigneeKind: true,
  assigneeUserId: true,
  assigneeCredentialId: true,
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
  assigneeCredentialId: true,
  assigneeDisplayNameSnapshot: true,
  assigneeUser: { select: taskPersonSummarySelect },
  meetingNote: {
    select: {
      id: true,
      title: true,
      projectId: true,
      project: { select: { id: true, name: true } },
      participants: { select: { userId: true, displayName: true } },
    },
  },
} as const;

const noteMyWorkSelect = {
  id: true,
  title: true,
  status: true,
  updatedAt: true,
  projectId: true,
  stewardKind: true,
  stewardUserId: true,
  stewardCredentialId: true,
  stewardDisplayNameSnapshot: true,
  stewardUser: { select: taskPersonSummarySelect },
  project: { select: { id: true, name: true } },
  participants: { select: { userId: true, displayName: true } },
} as const;

type TaskMyWorkRow = Prisma.TaskGetPayload<{ select: typeof taskMyWorkSelect }>;
type TodoMyWorkRow = Prisma.ProjectMeetingNoteActionGetPayload<{
  select: typeof todoMyWorkSelect;
}>;
type NoteMyWorkRow = Prisma.ProjectMeetingNoteGetPayload<{
  select: typeof noteMyWorkSelect;
}>;

type ParticipantRow = { userId: string | null; displayName: string };

function normalizeIdentifier(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function buildParticipantNameKeys(
  participants: ParticipantRow[]
): Set<string> {
  return new Set(
    participants
      .filter((participant) => participant.userId === null)
      .map((participant) =>
        getMeetingTodoParticipantNameKey(participant.displayName)
      )
  );
}

function taskWhereForAssignment(
  assignment: MyWorkAssignmentFilter,
  actorUserId: string
): Prisma.TaskWhereInput {
  const base: Prisma.TaskWhereInput = {
    archivedAt: null,
    project: buildProjectPrincipalWhere(actorUserId),
  };

  switch (assignment) {
    case "mine":
      return {
        ...base,
        assigneeKind: "human",
        assigneeUserId: actorUserId,
        status: { not: "Done" },
      };
    case "unassigned":
      return {
        ...base,
        assigneeUserId: null,
        assigneeCredentialId: null,
        status: { not: "Done" },
      };
    case "reassignment":
      return { ...base, assigneeKind: { not: null }, status: { not: "Done" } };
    case "all":
      return base;
  }
}

function todoWhereForAssignment(
  assignment: MyWorkAssignmentFilter,
  actorUserId: string
): Prisma.ProjectMeetingNoteActionWhereInput {
  const base: Prisma.ProjectMeetingNoteActionWhereInput = {
    meetingNote: { project: buildProjectPrincipalWhere(actorUserId) },
  };

  switch (assignment) {
    case "mine":
      return {
        ...base,
        completedAt: null,
        assigneeKind: "human",
        assigneeUserId: actorUserId,
      };
    case "unassigned":
      return { ...base, completedAt: null, assigneeKind: null };
    case "reassignment":
      return { ...base, completedAt: null, assigneeKind: { not: null } };
    case "all":
      return base;
  }
}

function noteWhereForAssignment(
  assignment: MyWorkAssignmentFilter,
  actorUserId: string
): Prisma.ProjectMeetingNoteWhereInput {
  const base: Prisma.ProjectMeetingNoteWhereInput = {
    project: buildProjectPrincipalWhere(actorUserId),
  };

  switch (assignment) {
    case "mine":
      return { ...base, stewardKind: "human", stewardUserId: actorUserId };
    case "unassigned":
      return { ...base, stewardKind: null };
    case "reassignment":
      return { ...base, stewardKind: { not: null } };
    case "all":
      return base;
  }
}

function resolveItemActor(input: {
  kind: "human" | "agent" | "participant" | null;
  id: string | null;
  displayNameSnapshot: string | null;
  user: Parameters<typeof mapStoredMeetingTodoActor>[0]["user"];
  registry: ProjectActorRegistry | null;
  participantNameKeys: Set<string> | null;
}): MeetingTodoActorSummary | null {
  if (!input.kind) {
    return null;
  }

  return mapStoredMeetingTodoActor({
    kind: input.kind,
    id: input.id,
    displayNameSnapshot: input.displayNameSnapshot,
    user: input.user,
    registry: input.registry,
    noteExternalParticipantNameKeys: input.participantNameKeys,
  });
}

async function loadRegistriesForProjects(
  db: DbClient,
  projectIds: Iterable<string>
): Promise<Map<string, ProjectActorRegistry | null>> {
  const distinctProjectIds = [...new Set(projectIds)].slice(
    0,
    PROJECT_REGISTRY_LIMIT
  );
  const entries = await Promise.all(
    distinctProjectIds.map(async (projectId) => {
      const registry = await loadProjectActorRegistry({ db, projectId });
      return [projectId, registry] as const;
    })
  );
  return new Map(entries);
}

export async function listMyWork(input: {
  actorUserId: string;
  assignment: MyWorkAssignmentFilter;
  type: MyWorkTypeFilter;
  projectId: string | null;
  query: string;
  sort: MyWorkSort;
}): Promise<MyWorkResult | null> {
  const actorUserId = normalizeIdentifier(input.actorUserId);
  if (!actorUserId) {
    return null;
  }
  const { assignment, type, sort } = input;
  const projectId = normalizeIdentifier(input.projectId) || null;
  const query = input.query.trim().toLowerCase();
  const fetchTake = MY_WORK_TYPE_LIMIT + 1;

  return withActorRlsContext(actorUserId, async (db) => {
    const [taskRows, todoRows, noteRows] = await Promise.all([
      db.task.findMany({
        where: taskWhereForAssignment(assignment, actorUserId),
        orderBy: [{ updatedAt: "desc" }],
        take: fetchTake,
        select: taskMyWorkSelect,
      }),
      db.projectMeetingNoteAction.findMany({
        where: todoWhereForAssignment(assignment, actorUserId),
        orderBy: [{ updatedAt: "desc" }],
        take: fetchTake,
        select: todoMyWorkSelect,
      }),
      db.projectMeetingNote.findMany({
        where: noteWhereForAssignment(assignment, actorUserId),
        orderBy: [{ updatedAt: "desc" }],
        take: fetchTake,
        select: noteMyWorkSelect,
      }),
    ]);

    const actorProjectIds: string[] = [];
    for (const row of taskRows) {
      if (row.assigneeKind) {
        actorProjectIds.push(row.projectId);
      }
    }
    for (const row of todoRows) {
      if (row.assigneeKind) {
        actorProjectIds.push(row.meetingNote.projectId);
      }
    }
    for (const row of noteRows) {
      if (row.stewardKind) {
        actorProjectIds.push(row.projectId);
      }
    }
    const registries = await loadRegistriesForProjects(db, actorProjectIds);

    const taskItems: MyWorkItem[] = taskRows.map((row) => {
      const actor = resolveItemActor({
        kind: row.assigneeKind,
        id:
          row.assigneeKind === "human"
            ? row.assigneeUserId
            : row.assigneeCredentialId,
        displayNameSnapshot: row.assigneeDisplayNameSnapshot,
        user: row.assigneeUser,
        registry: registries.get(row.projectId) ?? null,
        participantNameKeys: null,
      });
      return {
        id: row.id,
        type: "task",
        title: row.title,
        projectId: row.project.id,
        projectName: row.project.name,
        status: row.status,
        actor,
        needsReassignment:
          Boolean(registries.get(row.projectId)) &&
          actor !== null &&
          !actor.isAssignable,
        timestamp: row.updatedAt,
        href: `/projects/${row.project.id}?taskId=${row.id}`,
      };
    });

    const todoItems: MyWorkItem[] = todoRows.map((row) => {
      const actor = resolveItemActor({
        kind: row.assigneeKind,
        id:
          row.assigneeKind === "human"
            ? row.assigneeUserId
            : row.assigneeCredentialId,
        displayNameSnapshot: row.assigneeDisplayNameSnapshot,
        user: row.assigneeUser,
        registry: registries.get(row.meetingNote.projectId) ?? null,
        participantNameKeys: buildParticipantNameKeys(
          row.meetingNote.participants
        ),
      });
      return {
        id: row.id,
        type: "todo",
        title: row.content,
        projectId: row.meetingNote.projectId,
        projectName: row.meetingNote.project.name,
        status: row.completedAt ? "Done" : "Open",
        actor,
        needsReassignment:
          Boolean(registries.get(row.meetingNote.projectId)) &&
          actor !== null &&
          !actor.isAssignable,
        timestamp: row.updatedAt,
        href: `/projects/${row.meetingNote.projectId}/todos`,
      };
    });

    const noteItems: MyWorkItem[] = noteRows.map((row) => {
      const actor = resolveItemActor({
        kind: row.stewardKind,
        id:
          row.stewardKind === "human"
            ? row.stewardUserId
            : row.stewardCredentialId,
        displayNameSnapshot: row.stewardDisplayNameSnapshot,
        user: row.stewardUser,
        registry: registries.get(row.projectId) ?? null,
        participantNameKeys: buildParticipantNameKeys(row.participants),
      });
      return {
        id: row.id,
        type: "note",
        title: row.title,
        projectId: row.project.id,
        projectName: row.project.name,
        status: NOTE_STATUS_LABELS[row.status] ?? row.status,
        actor,
        needsReassignment:
          Boolean(registries.get(row.projectId)) &&
          actor !== null &&
          !actor.isAssignable,
        timestamp: row.updatedAt,
        href: `/projects/${row.project.id}?meetingNoteId=${row.id}`,
      };
    });

    // Each type is fetched newest-first and capped per type, so heavier
    // types cannot crowd others out of the merged list.
    const scopeItems = (list: MyWorkItem[]) =>
      list.slice(0, MY_WORK_TYPE_LIMIT);
    const stateItems = [
      ...scopeItems(
        assignment === "reassignment"
          ? taskItems.filter((item) => item.needsReassignment)
          : taskItems
      ),
      ...scopeItems(
        assignment === "reassignment"
          ? todoItems.filter((item) => item.needsReassignment)
          : todoItems
      ),
      ...scopeItems(
        assignment === "reassignment"
          ? noteItems.filter((item) => item.needsReassignment)
          : noteItems
      ),
    ];

    const typeCounts: MyWorkTypeCounts = {
      all: stateItems.length,
      task: stateItems.filter((item) => item.type === "task").length,
      todo: stateItems.filter((item) => item.type === "todo").length,
      note: stateItems.filter((item) => item.type === "note").length,
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
        todoRows.length > MY_WORK_TYPE_LIMIT ||
        noteRows.length > MY_WORK_TYPE_LIMIT,
      typeCounts,
      projects,
    };
  });
}
