import { beforeEach, describe, expect, test, vi } from "vitest";

const projectAccessServiceMock = vi.hoisted(() => ({
  buildProjectPrincipalWhere: vi.fn(),
  requireAgentProjectScopes: vi.fn(),
  requireProjectRole: vi.fn(),
}));

const rlsContextMock = vi.hoisted(() => ({
  withActorRlsContext: vi.fn(),
}));

const loggerMock = vi.hoisted(() => ({
  logServerError: vi.fn(),
}));

const activityMock = vi.hoisted(() => ({
  touchProjectActivity: vi.fn(),
}));

const dbMock = vi.hoisted(() => ({
  epic: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
}));

vi.mock("@/lib/services/project-access-service", () => ({
  buildProjectPrincipalWhere: projectAccessServiceMock.buildProjectPrincipalWhere,
  requireAgentProjectScopes: projectAccessServiceMock.requireAgentProjectScopes,
  requireProjectRole: projectAccessServiceMock.requireProjectRole,
}));

vi.mock("@/lib/services/rls-context", () => ({
  withActorRlsContext: rlsContextMock.withActorRlsContext,
}));

vi.mock("@/lib/services/project-activity-service", () => ({
  touchProjectActivity: activityMock.touchProjectActivity,
}));

vi.mock("@/lib/observability/logger", () => ({
  logServerError: loggerMock.logServerError,
}));

import {
  archiveProjectEpic,
  createProjectEpic,
  listProjectEpics,
  unarchiveProjectEpic,
  updateProjectEpic,
} from "@/lib/services/project-epic-service";

const DAY_MS = 24 * 60 * 60 * 1000;

function epicSummaryFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "epic-1",
    name: "Workspace launch",
    description: "Deliver the workspace launch slice.",
    archivedAt: null,
    createdAt: new Date("2026-04-20T08:00:00.000Z"),
    updatedAt: new Date("2026-04-21T09:00:00.000Z"),
    tasks: [],
    ...overrides,
  };
}

describe("project-epic-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    projectAccessServiceMock.buildProjectPrincipalWhere.mockReturnValue({
      mockPrincipalWhere: true,
    });
    projectAccessServiceMock.requireAgentProjectScopes.mockReturnValue({ ok: true });
    projectAccessServiceMock.requireProjectRole.mockResolvedValue({
      ok: true,
      role: "owner",
    });
    activityMock.touchProjectActivity.mockResolvedValue(undefined);
    dbMock.epic.findMany.mockResolvedValue([]);
    rlsContextMock.withActorRlsContext.mockImplementation(
      async (_actorUserId: string, operation: (db: typeof dbMock) => unknown) =>
        operation(dbMock)
    );
  });

  test("maps concurrent create uniqueness failures to epic-name-conflict", async () => {
    dbMock.epic.findFirst.mockResolvedValueOnce(null);
    dbMock.epic.create.mockRejectedValueOnce({ code: "P2002" });

    const result = await createProjectEpic({
      actorUserId: "user-1",
      projectId: "project-1",
      name: "Launch workspace",
      description: "Deliver the workspace launch slice.",
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "epic-name-conflict",
    });
    expect(loggerMock.logServerError).not.toHaveBeenCalled();
  });

  test("maps concurrent update uniqueness failures to epic-name-conflict", async () => {
    dbMock.epic.findFirst
      .mockResolvedValueOnce({ id: "epic-1" })
      .mockResolvedValueOnce(null);
    dbMock.epic.update.mockRejectedValueOnce({ code: "P2002" });

    const result = await updateProjectEpic({
      actorUserId: "user-1",
      projectId: "project-1",
      epicId: "epic-1",
      name: "Launch workspace",
      description: "Refine the launch scope.",
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "epic-name-conflict",
    });
    expect(loggerMock.logServerError).not.toHaveBeenCalled();
  });

  test("archives an epic and records project activity", async () => {
    const archivedAt = new Date("2026-09-13T10:00:00.000Z");
    dbMock.epic.findFirst
      .mockResolvedValueOnce({ id: "epic-1", archivedAt: null })
      .mockResolvedValueOnce(epicSummaryFixture({ archivedAt }));
    dbMock.epic.update.mockResolvedValueOnce({});

    const result = await archiveProjectEpic({
      actorUserId: "user-1",
      projectId: "project-1",
      epicId: "epic-1",
    });

    if (!result.ok) {
      throw new Error("expected archive to succeed");
    }
    expect(result.data.epic.archivedAt).toEqual(archivedAt);
    expect(dbMock.epic.update).toHaveBeenCalledWith({
      where: { id: "epic-1" },
      data: { archivedAt: expect.any(Date) },
    });
    expect(activityMock.touchProjectActivity).toHaveBeenCalledWith({
      db: dbMock,
      projectId: "project-1",
    });
  });

  test("archiving an already archived epic is a no-op", async () => {
    const archivedAt = new Date("2026-09-10T10:00:00.000Z");
    dbMock.epic.findFirst
      .mockResolvedValueOnce({ id: "epic-1", archivedAt })
      .mockResolvedValueOnce(epicSummaryFixture({ archivedAt }));

    const result = await archiveProjectEpic({
      actorUserId: "user-1",
      projectId: "project-1",
      epicId: "epic-1",
    });

    if (!result.ok) {
      throw new Error("expected archive to succeed");
    }
    expect(result.data.epic.archivedAt).toEqual(archivedAt);
    expect(dbMock.epic.update).not.toHaveBeenCalled();
    expect(activityMock.touchProjectActivity).not.toHaveBeenCalled();
  });

  test("restores an archived epic", async () => {
    dbMock.epic.findFirst
      .mockResolvedValueOnce({
        id: "epic-1",
        archivedAt: new Date("2026-09-10T10:00:00.000Z"),
      })
      .mockResolvedValueOnce(epicSummaryFixture());
    dbMock.epic.update.mockResolvedValueOnce({});

    const result = await unarchiveProjectEpic({
      actorUserId: "user-1",
      projectId: "project-1",
      epicId: "epic-1",
    });

    if (!result.ok) {
      throw new Error("expected restore to succeed");
    }
    expect(result.data.epic.archivedAt).toBeNull();
    expect(dbMock.epic.update).toHaveBeenCalledWith({
      where: { id: "epic-1" },
      data: { archivedAt: null },
    });
    expect(activityMock.touchProjectActivity).toHaveBeenCalledWith({
      db: dbMock,
      projectId: "project-1",
    });
  });

  test("returns 404 when archiving an unknown epic", async () => {
    dbMock.epic.findFirst.mockResolvedValueOnce(null);

    const result = await archiveProjectEpic({
      actorUserId: "user-1",
      projectId: "project-1",
      epicId: "epic-missing",
    });

    expect(result).toEqual({
      ok: false,
      status: 404,
      error: "epic-not-found",
    });
    expect(dbMock.epic.update).not.toHaveBeenCalled();
  });

  test("requires editor role to archive an epic", async () => {
    projectAccessServiceMock.requireProjectRole.mockResolvedValueOnce({
      ok: false,
      status: 403,
      error: "forbidden",
    });

    const result = await archiveProjectEpic({
      actorUserId: "user-1",
      projectId: "project-1",
      epicId: "epic-1",
    });

    expect(result).toEqual({
      ok: false,
      status: 403,
      error: "forbidden",
    });
    expect(dbMock.epic.findFirst).not.toHaveBeenCalled();
  });

  test("forwards agent scope failures from archive", async () => {
    projectAccessServiceMock.requireAgentProjectScopes.mockReturnValueOnce({
      ok: false,
      status: 403,
      error: "missing-agent-scope",
    });

    const result = await archiveProjectEpic({
      actorUserId: "user-1",
      projectId: "project-1",
      epicId: "epic-1",
    });

    expect(result).toEqual({
      ok: false,
      status: 403,
      error: "missing-agent-scope",
    });
    expect(rlsContextMock.withActorRlsContext).not.toHaveBeenCalled();
  });

  test("requires an actor to archive an epic", async () => {
    const result = await archiveProjectEpic({
      actorUserId: " ",
      projectId: "project-1",
      epicId: "epic-1",
    });

    expect(result).toEqual({
      ok: false,
      status: 401,
      error: "unauthorized",
    });
  });

  test("list excludes archived epics by default and sweeps stale completed epics", async () => {
    const staleCompletedAt = new Date(Date.now() - 8 * DAY_MS);
    const recentCompletedAt = new Date(Date.now() - 1 * DAY_MS);
    dbMock.epic.findMany
      .mockResolvedValueOnce([
        {
          id: "epic-stale",
          tasks: [
            {
              status: "Done",
              archivedAt: null,
              completedAt: staleCompletedAt,
              updatedAt: staleCompletedAt,
            },
          ],
        },
        {
          id: "epic-recent",
          tasks: [
            {
              status: "Done",
              archivedAt: null,
              completedAt: recentCompletedAt,
              updatedAt: recentCompletedAt,
            },
          ],
        },
        {
          id: "epic-open",
          tasks: [
            {
              status: "In Progress",
              archivedAt: null,
              completedAt: null,
              updatedAt: recentCompletedAt,
            },
          ],
        },
        { id: "epic-empty", tasks: [] },
      ])
      .mockResolvedValueOnce([epicSummaryFixture()]);

    const epics = await listProjectEpics("project-1", "user-1");

    expect(epics).toHaveLength(1);
    expect(dbMock.epic.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["epic-stale"] }, archivedAt: null },
      data: { archivedAt: expect.any(Date) },
    });
    expect(dbMock.epic.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { projectId: "project-1", archivedAt: null },
      })
    );
  });

  test("list includes archived epics when requested", async () => {
    dbMock.epic.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        epicSummaryFixture({ archivedAt: new Date("2026-09-10T10:00:00.000Z") }),
      ]);

    const epics = await listProjectEpics("project-1", "user-1", undefined, {
      includeArchived: true,
    });

    expect(epics).toHaveLength(1);
    expect(dbMock.epic.updateMany).not.toHaveBeenCalled();
    expect(dbMock.epic.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { projectId: "project-1" },
      })
    );
  });
});
