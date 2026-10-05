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

export const MY_WORK_VIEWS = [
  "assigned",
  "unassigned",
  "reassignment",
  "recent",
] as const;

export type MyWorkView = (typeof MY_WORK_VIEWS)[number];

export function isMyWorkView(value: string): value is MyWorkView {
  return (MY_WORK_VIEWS as readonly string[]).includes(value);
}

export type MyWorkItemType = "task" | "todo" | "note";

export interface MyWorkItem {
  id: string;
  type: MyWorkItemType;
  title: string;
  projectId: string;
  projectName: string;
  lane: string | null;
  actor: MeetingTodoActorSummary | null;
  needsReassignment: boolean;
  timestamp: Date;
  href: string;
}

export interface MyWorkSection {
  count: number;
  truncated: boolean;
  items: MyWorkItem[];
}

export interface MyWorkResult {
  view: MyWorkView;
  tasks: MyWorkSection;
  todos: MyWorkSection;
  notes: MyWorkSection;
}

export const MY_WORK_SECTION_LIMIT = 200;

// Bounds registry lookups (one RPC per project) on the reassignment/recent
// views when an account spans many projects; skipped registries only lose
// live actor status, not row visibility.
const PROJECT_REGISTRY_LIMIT = 50;

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

function taskWhereForView(
  view: MyWorkView,
  actorUserId: string
): Prisma.TaskWhereInput {
  const base: Prisma.TaskWhereInput = {
    archivedAt: null,
    project: buildProjectPrincipalWhere(actorUserId),
  };

  switch (view) {
    case "assigned":
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
    case "recent":
      return base;
  }
}

function todoWhereForView(
  view: MyWorkView,
  actorUserId: string
): Prisma.ProjectMeetingNoteActionWhereInput {
  const base: Prisma.ProjectMeetingNoteActionWhereInput = {
    meetingNote: { project: buildProjectPrincipalWhere(actorUserId) },
  };

  switch (view) {
    case "assigned":
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
    case "recent":
      return base;
  }
}

function noteWhereForView(
  view: MyWorkView,
  actorUserId: string
): Prisma.ProjectMeetingNoteWhereInput {
  const base: Prisma.ProjectMeetingNoteWhereInput = {
    project: buildProjectPrincipalWhere(actorUserId),
  };

  switch (view) {
    case "assigned":
      return { ...base, stewardKind: "human", stewardUserId: actorUserId };
    case "unassigned":
      return { ...base, stewardKind: null };
    case "reassignment":
      return { ...base, stewardKind: { not: null } };
    case "recent":
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

function buildSection(
  items: MyWorkItem[],
  forceTruncated: boolean
): MyWorkSection {
  const truncated = forceTruncated || items.length > MY_WORK_SECTION_LIMIT;
  return {
    count: Math.min(items.length, MY_WORK_SECTION_LIMIT),
    truncated,
    items: items.slice(0, MY_WORK_SECTION_LIMIT),
  };
}

export async function listMyWork(input: {
  actorUserId: string;
  view: MyWorkView;
}): Promise<MyWorkResult | null> {
  const actorUserId = normalizeIdentifier(input.actorUserId);
  if (!actorUserId) {
    return null;
  }
  const { view } = input;
  const fetchTake = MY_WORK_SECTION_LIMIT + 1;

  return withActorRlsContext(actorUserId, async (db) => {
    const [taskRows, todoRows, noteRows] = await Promise.all([
      db.task.findMany({
        where: taskWhereForView(view, actorUserId),
        orderBy: [{ updatedAt: "desc" }],
        take: fetchTake,
        select: taskMyWorkSelect,
      }),
      db.projectMeetingNoteAction.findMany({
        where: todoWhereForView(view, actorUserId),
        orderBy: [{ updatedAt: "desc" }],
        take: fetchTake,
        select: todoMyWorkSelect,
      }),
      db.projectMeetingNote.findMany({
        where: noteWhereForView(view, actorUserId),
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
        lane: row.status,
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
        lane: row.completedAt ? "Done" : null,
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
        lane: null,
        actor,
        needsReassignment:
          Boolean(registries.get(row.projectId)) &&
          actor !== null &&
          !actor.isAssignable,
        timestamp: row.updatedAt,
        href: `/projects/${row.project.id}?meetingNoteId=${row.id}`,
      };
    });

    return {
      view,
      tasks: buildSection(
        view === "reassignment"
          ? taskItems.filter((item) => item.needsReassignment)
          : taskItems,
        view === "reassignment" && taskRows.length > MY_WORK_SECTION_LIMIT
      ),
      todos: buildSection(
        view === "reassignment"
          ? todoItems.filter((item) => item.needsReassignment)
          : todoItems,
        view === "reassignment" && todoRows.length > MY_WORK_SECTION_LIMIT
      ),
      notes: buildSection(
        view === "reassignment"
          ? noteItems.filter((item) => item.needsReassignment)
          : noteItems,
        view === "reassignment" && noteRows.length > MY_WORK_SECTION_LIMIT
      ),
    };
  });
}
