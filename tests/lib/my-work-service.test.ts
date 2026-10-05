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

import { listMyWork, MY_WORK_SECTION_LIMIT } from "@/lib/services/my-work-service";

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
    expect(await listMyWork({ actorUserId: "  ", view: "assigned" })).toBeNull();
    expect(rlsContextMock.withActorRlsContext).not.toHaveBeenCalled();
  });

  test("assigned view queries self-assigned open tasks, todos, and stewarded notes", async () => {
    dbMock.task.findMany.mockResolvedValueOnce([taskRow()]);
    dbMock.projectMeetingNoteAction.findMany.mockResolvedValueOnce([todoRow()]);
    dbMock.projectMeetingNote.findMany.mockResolvedValueOnce([
      noteRow({ stewardKind: "human", stewardUserId: "user-1" }),
    ]);
    actorServiceMock.loadProjectActorRegistry.mockResolvedValue(
      registryFixture({ humans: [humanSummary("user-1", "Owner", "active")] })
    );

    const result = await listMyWork({ actorUserId: " user-1 ", view: "assigned" });

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
        take: MY_WORK_SECTION_LIMIT + 1,
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

    expect(result?.tasks.items[0]).toEqual(
      expect.objectContaining({
        id: "task-1",
        type: "task",
        title: "Fix the login flow",
        lane: "In Progress",
        projectName: "Alpha",
        href: "/projects/project-1?taskId=task-1",
        needsReassignment: false,
      })
    );
    expect(result?.tasks.items[0]?.actor).toEqual(
      expect.objectContaining({ id: "user-1", status: "active" })
    );
    expect(result?.todos.items[0]).toEqual(
      expect.objectContaining({
        type: "todo",
        href: "/projects/project-1/todos",
        lane: null,
      })
    );
    expect(result?.notes.items[0]).toEqual(
      expect.objectContaining({
        type: "note",
        href: "/projects/project-1?meetingNoteId=note-1",
      })
    );
    expect(result?.tasks).toEqual({ count: 1, truncated: false, items: result?.tasks.items });
  });

  test("unassigned view uses participant-aware null-assignee predicates", async () => {
    dbMock.task.findMany.mockResolvedValueOnce([
      taskRow({
        assigneeKind: null,
        assigneeUserId: null,
        assigneeDisplayNameSnapshot: null,
        assigneeUser: null,
      }),
    ]);

    const result = await listMyWork({ actorUserId: "user-1", view: "unassigned" });

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
    expect(result?.tasks.items[0]?.actor).toBeNull();
    expect(result?.tasks.items[0]?.needsReassignment).toBe(false);
  });

  test("reassignment view keeps only rows whose actor is no longer assignable", async () => {
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

    const result = await listMyWork({
      actorUserId: "user-1",
      view: "reassignment",
    });

    expect(result?.tasks.items.map((item) => item.id)).toEqual([
      "task-revoked-agent",
      "task-former-member",
    ]);
    expect(result?.tasks.items[0]?.needsReassignment).toBe(true);
    expect(result?.tasks.items[1]?.needsReassignment).toBe(true);
    expect(result?.todos.items).toEqual([]);
    expect(result?.notes.items.map((item) => item.id)).toEqual([
      "note-former-guest",
    ]);
    expect(result?.notes.items[0]?.needsReassignment).toBe(true);
  });

  test("recent view drops the status predicate and keeps completed work", async () => {
    dbMock.task.findMany.mockResolvedValueOnce([taskRow({ status: "Done" })]);
    dbMock.projectMeetingNoteAction.findMany.mockResolvedValueOnce([
      todoRow({ completedAt: new Date("2026-10-03T09:00:00.000Z") }),
    ]);
    actorServiceMock.loadProjectActorRegistry.mockResolvedValue(
      registryFixture({ humans: [humanSummary("user-1", "Owner", "active")] })
    );

    const result = await listMyWork({ actorUserId: "user-1", view: "recent" });

    const taskWhere = dbMock.task.findMany.mock.calls[0]?.[0]?.where as Record<
      string,
      unknown
    >;
    expect(taskWhere).not.toHaveProperty("status");
    expect(taskWhere).not.toHaveProperty("assigneeUserId");
    const todoWhere = dbMock.projectMeetingNoteAction.findMany.mock.calls[0]?.[0]
      ?.where as Record<string, unknown>;
    expect(todoWhere).not.toHaveProperty("completedAt");
    expect(result?.tasks.items[0]?.lane).toBe("Done");
    expect(result?.todos.items[0]?.lane).toBe("Done");
    expect(result?.todos.items[0]?.actor).toEqual(
      expect.objectContaining({ id: "user-1", status: "active" })
    );
  });

  test("truncates sections beyond the limit and reports the capped count", async () => {
    const rows = Array.from({ length: MY_WORK_SECTION_LIMIT + 1 }, (_, index) =>
      taskRow({ id: `task-${index}` })
    );
    dbMock.task.findMany.mockResolvedValueOnce(rows);

    const result = await listMyWork({ actorUserId: "user-1", view: "recent" });

    expect(result?.tasks.count).toBe(MY_WORK_SECTION_LIMIT);
    expect(result?.tasks.truncated).toBe(true);
    expect(result?.tasks.items).toHaveLength(MY_WORK_SECTION_LIMIT);
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

    await listMyWork({ actorUserId: "user-1", view: "recent" });

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

    const result = await listMyWork({ actorUserId: "user-1", view: "recent" });

    expect(result?.tasks.items.every((item) => !item.needsReassignment)).toBe(
      true
    );
  });
});
