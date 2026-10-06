import { beforeEach, describe, expect, test, vi } from "vitest";

const projectAccessMock = vi.hoisted(() => ({
  buildProjectPrincipalWhere: vi.fn(),
}));

const rlsContextMock = vi.hoisted(() => ({
  withActorRlsContext: vi.fn(),
}));

const actorServiceMock = vi.hoisted(() => ({
  loadProjectActorRegistry: vi.fn(),
}));

const dbMock = vi.hoisted(() => ({
  task: { findMany: vi.fn() },
  projectMeetingNoteAction: { findMany: vi.fn() },
  projectMeetingNote: { findMany: vi.fn() },
}));

vi.mock("@/lib/services/project-access-service", () => ({
  buildProjectPrincipalWhere: projectAccessMock.buildProjectPrincipalWhere,
}));

vi.mock("@/lib/services/rls-context", () => ({
  withActorRlsContext: rlsContextMock.withActorRlsContext,
}));

vi.mock("@/lib/services/project-actor-service", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/services/project-actor-service")>();
  return {
    ...actual,
    loadProjectActorRegistry: actorServiceMock.loadProjectActorRegistry,
  };
});

import {
  listMyWork,
  MY_WORK_TYPE_LIMIT,
  type MyWorkAssignmentFilter,
} from "@/lib/services/my-work-service";

const principalWhere = {
  OR: [{ ownerId: "user-1" }, { memberships: { some: { userId: "user-1" } } }],
};

function humanSummary(id: string, displayName: string, status: "active" | "inactive") {
  return {
    kind: "human" as const,
    id,
    displayName,
    usernameTag: null,
    avatarSeed: null,
    status,
    isAssignable: status === "active",
  };
}

function agentSummary(id: string, displayName: string, status: "active" | "revoked") {
  return {
    kind: "agent" as const,
    id,
    displayName,
    usernameTag: null,
    avatarSeed: null,
    status,
    isAssignable: status === "active",
  };
}

function registryFixture(input: {
  humans?: ReturnType<typeof humanSummary>[];
  credentials?: ReturnType<typeof agentSummary>[];
}) {
  const humans = input.humans ?? [];
  const credentials = input.credentials ?? [];
  return {
    activeHumanIds: new Set(
      humans.filter((human) => human.status === "active").map((human) => human.id)
    ),
    humanById: new Map(humans.map((human) => [human.id, human])),
    credentialById: new Map(credentials.map((credential) => [credential.id, credential])),
    assignable: [...humans, ...credentials].filter((actor) => actor.isAssignable),
  };
}

function taskRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "task-1",
    title: "Fix the login flow",
    status: "In Progress",
    updatedAt: new Date("2026-10-01T10:00:00.000Z"),
    projectId: "project-1",
    assigneeKind: "human",
    assigneeUserId: "user-1",
    assigneeCredentialId: null,
    assigneeDisplayNameSnapshot: "Owner",
    assigneeUser: {
      id: "user-1",
      name: "Owner",
      email: "owner@example.com",
      username: "owner",
      usernameDiscriminator: "0001",
      avatarSeed: null,
    },
    project: { id: "project-1", name: "Alpha" },
    ...overrides,
  };
}

function todoRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "todo-1",
    content: "Send the launch recap",
    completedAt: null,
    updatedAt: new Date("2026-10-02T09:00:00.000Z"),
    assigneeKind: "human",
    assigneeUserId: "user-1",
    assigneeCredentialId: null,
    assigneeDisplayNameSnapshot: "Owner",
    assigneeUser: null,
    meetingNote: {
      id: "note-9",
      title: "Launch review",
      projectId: "project-1",
      project: { id: "project-1", name: "Alpha" },
      participants: [],
    },
    ...overrides,
  };
}

function noteRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "note-1",
    title: "Kickoff",
    status: "prepared",
    updatedAt: new Date("2026-09-30T08:00:00.000Z"),
    projectId: "project-1",
    stewardKind: null,
    stewardUserId: null,
    stewardCredentialId: null,
    stewardDisplayNameSnapshot: null,
    stewardUser: null,
    project: { id: "project-1", name: "Alpha" },
    participants: [],
    ...overrides,
  };
}

function baseInput(assignment: MyWorkAssignmentFilter) {
  return {
    actorUserId: "user-1",
    assignment,
    type: "all" as const,
    projectId: null,
    query: "",
    sort: "recent" as const,
  };
}

describe("my work service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectAccessMock.buildProjectPrincipalWhere.mockReturnValue(principalWhere);
    rlsContextMock.withActorRlsContext.mockImplementation(
      async (_actorUserId: string, operation: (db: typeof dbMock) => unknown) =>
        operation(dbMock)
    );
    dbMock.task.findMany.mockResolvedValue([]);
    dbMock.projectMeetingNoteAction.findMany.mockResolvedValue([]);
    dbMock.projectMeetingNote.findMany.mockResolvedValue([]);
    actorServiceMock.loadProjectActorRegistry.mockResolvedValue(null);
  });

  test("returns null for an empty actor", async () => {
    expect(
      await listMyWork({ ...baseInput("mine"), actorUserId: "  " })
    ).toBeNull();
    expect(rlsContextMock.withActorRlsContext).not.toHaveBeenCalled();
  });

  test("mine queries self-assigned open tasks, todos, and stewarded notes", async () => {
    dbMock.task.findMany.mockResolvedValueOnce([taskRow()]);
    dbMock.projectMeetingNoteAction.findMany.mockResolvedValueOnce([todoRow()]);
    dbMock.projectMeetingNote.findMany.mockResolvedValueOnce([
      noteRow({ stewardKind: "human", stewardUserId: "user-1" }),
    ]);
    actorServiceMock.loadProjectActorRegistry.mockResolvedValue(
      registryFixture({ humans: [humanSummary("user-1", "Owner", "active")] })
    );

    const result = await listMyWork({ ...baseInput("mine"), actorUserId: " user-1 " });

    expect(rlsContextMock.withActorRlsContext).toHaveBeenCalledWith(
      "user-1",
      expect.any(Function)
    );
    expect(projectAccessMock.buildProjectPrincipalWhere).toHaveBeenCalledWith(
      "user-1"
    );
    expect(dbMock.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          archivedAt: null,
          assigneeKind: "human",
          assigneeUserId: "user-1",
          status: { not: "Done" },
          project: principalWhere,
        }),
        orderBy: [{ updatedAt: "desc" }],
        take: MY_WORK_TYPE_LIMIT + 1,
      })
    );
    expect(dbMock.projectMeetingNoteAction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          completedAt: null,
          assigneeKind: "human",
          assigneeUserId: "user-1",
          meetingNote: { project: principalWhere },
        }),
      })
    );
    expect(dbMock.projectMeetingNote.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          stewardKind: "human",
          stewardUserId: "user-1",
          project: principalWhere,
        }),
      })
    );

    expect(result?.items.map((item) => item.type)).toEqual([
      "todo",
      "task",
      "note",
    ]);
    expect(result?.items.find((item) => item.type === "task")).toEqual(
      expect.objectContaining({
        id: "task-1",
        title: "Fix the login flow",
        status: "In Progress",
        projectName: "Alpha",
        href: "/projects/project-1?taskId=task-1",
        needsReassignment: false,
      })
    );
    expect(result?.items.find((item) => item.type === "task")?.actor).toEqual(
      expect.objectContaining({ id: "user-1", status: "active" })
    );
    expect(result?.items.find((item) => item.type === "todo")).toEqual(
      expect.objectContaining({
        href: "/projects/project-1/todos",
        status: "Open",
      })
    );
    expect(result?.items.find((item) => item.type === "note")).toEqual(
      expect.objectContaining({
        href: "/projects/project-1?meetingNoteId=note-1",
        status: "Prepared",
      })
    );
    expect(result?.typeCounts).toEqual({ all: 3, task: 1, todo: 1, note: 1 });
    expect(result?.projects).toEqual([
      { id: "project-1", name: "Alpha", count: 3 },
    ]);
    expect(result?.total).toBe(3);
    expect(result?.truncated).toBe(false);
  });

  test("unassigned uses participant-aware null-assignee predicates", async () => {
    dbMock.task.findMany.mockResolvedValueOnce([
      taskRow({
        assigneeKind: null,
        assigneeUserId: null,
        assigneeDisplayNameSnapshot: null,
        assigneeUser: null,
      }),
    ]);

    const result = await listMyWork(baseInput("unassigned"));

    expect(dbMock.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          assigneeUserId: null,
          assigneeCredentialId: null,
          status: { not: "Done" },
        }),
      })
    );
    expect(dbMock.projectMeetingNoteAction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          completedAt: null,
          assigneeKind: null,
        }),
      })
    );
    expect(dbMock.projectMeetingNote.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ stewardKind: null }),
      })
    );
    expect(result?.items[0]?.actor).toBeNull();
    expect(result?.items[0]?.needsReassignment).toBe(false);
  });

  test("reassignment keeps only rows whose actor is no longer assignable", async () => {
    dbMock.task.findMany.mockResolvedValueOnce([
      taskRow({
        id: "task-revoked-agent",
        assigneeKind: "agent",
        assigneeUserId: null,
        assigneeCredentialId: "cred-1",
        assigneeDisplayNameSnapshot: "Codex bot",
      }),
      taskRow({
        id: "task-former-member",
        assigneeKind: "human",
        assigneeUserId: "user-gone",
        assigneeDisplayNameSnapshot: "Gone Person",
        assigneeUser: {
          id: "user-gone",
          name: "Gone Person",
          email: null,
          username: null,
          usernameDiscriminator: null,
          avatarSeed: null,
        },
      }),
      taskRow({
        id: "task-active",
        assigneeKind: "human",
        assigneeUserId: "user-2",
        assigneeDisplayNameSnapshot: "Member",
      }),
    ]);
    dbMock.projectMeetingNoteAction.findMany.mockResolvedValueOnce([
      todoRow({
        id: "todo-active",
        assigneeKind: "human",
        assigneeUserId: "user-2",
      }),
    ]);
    dbMock.projectMeetingNote.findMany.mockResolvedValueOnce([
      noteRow({
        id: "note-former-guest",
        stewardKind: "participant",
        stewardUserId: null,
        stewardCredentialId: null,
        stewardDisplayNameSnapshot: "External Guest",
        participants: [{ userId: "user-1", displayName: "Owner" }],
      }),
      noteRow({
        id: "note-current-guest",
        stewardKind: "participant",
        stewardUserId: null,
        stewardCredentialId: null,
        stewardDisplayNameSnapshot: "External Guest",
        participants: [{ userId: null, displayName: "External Guest" }],
      }),
    ]);
    actorServiceMock.loadProjectActorRegistry.mockResolvedValue(
      registryFixture({
        humans: [
          humanSummary("user-1", "Owner", "active"),
          humanSummary("user-2", "Member", "active"),
        ],
        credentials: [agentSummary("cred-1", "Codex bot", "revoked")],
      })
    );

    const result = await listMyWork(baseInput("reassignment"));

    expect(result?.items.map((item) => item.id)).toEqual([
      "task-revoked-agent",
      "task-former-member",
      "note-former-guest",
    ]);
    expect(result?.items.every((item) => item.needsReassignment)).toBe(true);
    expect(result?.typeCounts).toEqual({ all: 3, task: 2, todo: 0, note: 1 });
  });

  test("all drops the status predicate and keeps completed work", async () => {
    dbMock.task.findMany.mockResolvedValueOnce([taskRow({ status: "Done" })]);
    dbMock.projectMeetingNoteAction.findMany.mockResolvedValueOnce([
      todoRow({ completedAt: new Date("2026-10-03T09:00:00.000Z") }),
    ]);
    actorServiceMock.loadProjectActorRegistry.mockResolvedValue(
      registryFixture({ humans: [humanSummary("user-1", "Owner", "active")] })
    );

    const result = await listMyWork(baseInput("all"));

    const taskWhere = dbMock.task.findMany.mock.calls[0]?.[0]?.where as Record<
      string,
      unknown
    >;
    expect(taskWhere).not.toHaveProperty("status");
    expect(taskWhere).not.toHaveProperty("assigneeUserId");
    const todoWhere = dbMock.projectMeetingNoteAction.findMany.mock.calls[0]?.[0]
      ?.where as Record<string, unknown>;
    expect(todoWhere).not.toHaveProperty("completedAt");
    expect(result?.items.find((item) => item.type === "task")?.status).toBe(
      "Done"
    );
    expect(result?.items.find((item) => item.type === "todo")?.status).toBe(
      "Done"
    );
  });

  test("filters by type without changing the facet counts", async () => {
    dbMock.task.findMany.mockResolvedValueOnce([taskRow()]);
    dbMock.projectMeetingNote.findMany.mockResolvedValueOnce([
      noteRow({ stewardKind: "human", stewardUserId: "user-1" }),
    ]);

    const result = await listMyWork({ ...baseInput("mine"), type: "task" });

    expect(result?.items.map((item) => item.type)).toEqual(["task"]);
    expect(result?.total).toBe(1);
    expect(result?.typeCounts).toEqual({ all: 2, task: 1, todo: 0, note: 1 });
    expect(result?.projects).toEqual([
      { id: "project-1", name: "Alpha", count: 2 },
    ]);
  });

  test("filters by project and combines with search and sort", async () => {
    const rows = [
      taskRow({ id: "task-old", title: "Alpha cleanup", updatedAt: new Date("2026-10-01T10:00:00.000Z") }),
      taskRow({
        id: "task-new",
        title: "Alpha LOGIN fix",
        updatedAt: new Date("2026-10-04T10:00:00.000Z"),
      }),
      taskRow({
        id: "task-other-project",
        title: "Alpha elsewhere",
        updatedAt: new Date("2026-10-02T10:00:00.000Z"),
        projectId: "project-2",
        project: { id: "project-2", name: "Beta" },
      }),
    ];
    dbMock.task.findMany.mockResolvedValueOnce(rows);
    actorServiceMock.loadProjectActorRegistry.mockResolvedValue(
      registryFixture({ humans: [humanSummary("user-1", "Owner", "active")] })
    );

    const filtered = await listMyWork({
      ...baseInput("mine"),
      projectId: "project-1",
      query: "alpha login",
    });

    expect(filtered?.items.map((item) => item.id)).toEqual(["task-new"]);
    expect(filtered?.typeCounts.all).toBe(3);
    expect(filtered?.projects.map((project) => project.id).sort()).toEqual([
      "project-1",
      "project-2",
    ]);

    dbMock.task.findMany.mockResolvedValueOnce(rows);
    const oldest = await listMyWork({ ...baseInput("mine"), sort: "oldest" });

    expect(oldest?.items.map((item) => item.id)).toEqual([
      "task-old",
      "task-other-project",
      "task-new",
    ]);
  });

  test("caps each type at the limit and flags truncation", async () => {
    const rows = Array.from({ length: MY_WORK_TYPE_LIMIT + 1 }, (_, index) =>
      taskRow({ id: `task-${index}` })
    );
    dbMock.task.findMany.mockResolvedValueOnce(rows);

    const result = await listMyWork(baseInput("all"));

    expect(result?.items).toHaveLength(MY_WORK_TYPE_LIMIT);
    expect(result?.total).toBe(MY_WORK_TYPE_LIMIT);
    expect(result?.typeCounts.all).toBe(MY_WORK_TYPE_LIMIT);
    expect(result?.truncated).toBe(true);
  });

  test("loads each project registry once and only for rows with actors", async () => {
    dbMock.task.findMany.mockResolvedValueOnce([
      taskRow({ id: "task-a", projectId: "project-1" }),
      taskRow({
        id: "task-b",
        projectId: "project-2",
        project: { id: "project-2", name: "Beta" },
      }),
      taskRow({
        id: "task-c",
        projectId: "project-1",
        assigneeKind: null,
        assigneeUserId: null,
      }),
    ]);

    await listMyWork(baseInput("all"));

    const registryCalls = actorServiceMock.loadProjectActorRegistry.mock.calls.map(
      (call) => call[0].projectId
    );
    expect(registryCalls.sort()).toEqual(["project-1", "project-2"]);
    expect(
      actorServiceMock.loadProjectActorRegistry.mock.calls[0]?.[0].db
    ).toBe(dbMock);
  });

  test("suppresses needs-reassignment when no registry was resolved", async () => {
    dbMock.task.findMany.mockResolvedValueOnce([
      taskRow({
        assigneeKind: "agent",
        assigneeUserId: null,
        assigneeCredentialId: "cred-1",
      }),
      taskRow({ id: "task-2" }),
    ]);
    actorServiceMock.loadProjectActorRegistry.mockResolvedValue(null);

    const result = await listMyWork(baseInput("all"));

    expect(result?.items.every((item) => !item.needsReassignment)).toBe(true);
  });
});
