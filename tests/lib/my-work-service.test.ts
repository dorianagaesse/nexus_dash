import { beforeEach, describe, expect, test, vi } from "vitest";

const projectAccessMock = vi.hoisted(() => ({
  buildProjectPrincipalWhere: vi.fn(),
}));

const rlsContextMock = vi.hoisted(() => ({
  withActorRlsContext: vi.fn(),
}));

const dbMock = vi.hoisted(() => ({
  task: { findMany: vi.fn() },
  projectMeetingNoteAction: { findMany: vi.fn() },
}));

vi.mock("@/lib/services/project-access-service", () => ({
  buildProjectPrincipalWhere: projectAccessMock.buildProjectPrincipalWhere,
}));

vi.mock("@/lib/services/rls-context", () => ({
  withActorRlsContext: rlsContextMock.withActorRlsContext,
}));

import {
  listMyWork,
  MY_WORK_TYPE_LIMIT,
} from "@/lib/services/my-work-service";

const principalWhere = {
  OR: [{ ownerId: "user-1" }, { memberships: { some: { userId: "user-1" } } }],
};

const ownerUser = {
  id: "user-1",
  name: "Owner",
  email: "owner@example.com",
  username: "owner",
  usernameDiscriminator: "0001",
  avatarSeed: null,
};

function taskRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "task-1",
    title: "Fix the login flow",
    status: "In Progress",
    updatedAt: new Date("2026-10-01T10:00:00.000Z"),
    projectId: "project-1",
    assigneeKind: "human",
    assigneeUserId: "user-1",
    assigneeDisplayNameSnapshot: "Owner",
    assigneeUser: ownerUser,
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
    assigneeDisplayNameSnapshot: "Owner",
    assigneeUser: ownerUser,
    meetingNote: {
      projectId: "project-1",
      project: { id: "project-1", name: "Alpha" },
    },
    ...overrides,
  };
}

function baseInput(
  overrides: Partial<Parameters<typeof listMyWork>[0]> = {}
): Parameters<typeof listMyWork>[0] {
  return {
    actorUserId: "user-1",
    type: "all",
    projectId: null,
    query: "",
    sort: "recent",
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
  });

  test("returns null for an empty actor", async () => {
    expect(
      await listMyWork(baseInput({ actorUserId: "  " }))
    ).toBeNull();
    expect(rlsContextMock.withActorRlsContext).not.toHaveBeenCalled();
  });

  test("loads open tasks and todos assigned to the acting user under principal scope", async () => {
    dbMock.task.findMany.mockResolvedValueOnce([taskRow()]);
    dbMock.projectMeetingNoteAction.findMany.mockResolvedValueOnce([todoRow()]);

    const result = await listMyWork(baseInput({ actorUserId: " user-1 " }));

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
        orderBy: [{ updatedAt: "desc" }],
        take: MY_WORK_TYPE_LIMIT + 1,
      })
    );

    // Newest first across types: todo (10-02) before task (10-01).
    expect(result?.items.map((item) => item.type)).toEqual(["todo", "task"]);
    expect(result?.items.find((item) => item.type === "task")).toEqual(
      expect.objectContaining({
        id: "task-1",
        title: "Fix the login flow",
        status: "In Progress",
        projectName: "Alpha",
        href: "/projects/project-1?taskId=task-1",
      })
    );
    expect(result?.items.find((item) => item.type === "task")?.actor).toEqual(
      expect.objectContaining({
        id: "user-1",
        status: "active",
        isAssignable: true,
      })
    );
    expect(result?.items.find((item) => item.type === "todo")).toEqual(
      expect.objectContaining({
        title: "Send the launch recap",
        status: "Open",
        href: "/projects/project-1/todos",
      })
    );
    expect(result?.items.find((item) => item.type === "todo")?.actor).toEqual(
      expect.objectContaining({ id: "user-1", status: "active" })
    );
    expect(result?.typeCounts).toEqual({ all: 2, task: 1, todo: 1 });
    expect(result?.projects).toEqual([
      { id: "project-1", name: "Alpha", count: 2 },
    ]);
    expect(result?.total).toBe(2);
    expect(result?.truncated).toBe(false);
  });

  test("filters by type without changing the facet counts", async () => {
    dbMock.task.findMany.mockResolvedValueOnce([taskRow()]);
    dbMock.projectMeetingNoteAction.findMany.mockResolvedValueOnce([todoRow()]);

    const result = await listMyWork(baseInput({ type: "task" }));

    expect(result?.items.map((item) => item.type)).toEqual(["task"]);
    expect(result?.total).toBe(1);
    expect(result?.typeCounts).toEqual({ all: 2, task: 1, todo: 1 });
    expect(result?.projects).toEqual([
      { id: "project-1", name: "Alpha", count: 2 },
    ]);
  });

  test("filters by project and combines with search and sort", async () => {
    const rows = [
      taskRow({
        id: "task-old",
        title: "Alpha cleanup",
        updatedAt: new Date("2026-10-01T10:00:00.000Z"),
      }),
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

    const filtered = await listMyWork(
      baseInput({ projectId: "project-1", query: "alpha login" })
    );

    expect(filtered?.items.map((item) => item.id)).toEqual(["task-new"]);
    expect(filtered?.typeCounts.all).toBe(3);
    expect(filtered?.projects.map((project) => project.id).sort()).toEqual([
      "project-1",
      "project-2",
    ]);

    dbMock.task.findMany.mockResolvedValueOnce(rows);

    const oldest = await listMyWork(baseInput({ sort: "oldest" }));

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

    const result = await listMyWork(baseInput());

    expect(result?.items).toHaveLength(MY_WORK_TYPE_LIMIT);
    expect(result?.total).toBe(MY_WORK_TYPE_LIMIT);
    expect(result?.typeCounts.all).toBe(MY_WORK_TYPE_LIMIT);
    expect(result?.truncated).toBe(true);
  });
});
