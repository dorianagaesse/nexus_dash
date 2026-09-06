import { beforeEach, describe, expect, test, vi } from "vitest";

const projectAccessServiceMock = vi.hoisted(() => ({
  requireProjectRole: vi.fn(),
}));
const rlsContextMock = vi.hoisted(() => ({ withActorRlsContext: vi.fn() }));
const loggerMock = vi.hoisted(() => ({ logServerError: vi.fn() }));
const dbMock = vi.hoisted(() => ({ task: { findMany: vi.fn() } }));

vi.mock("@/lib/services/project-access-service", () => ({
  requireProjectRole: projectAccessServiceMock.requireProjectRole,
}));
vi.mock("@/lib/services/rls-context", () => ({
  withActorRlsContext: rlsContextMock.withActorRlsContext,
}));
vi.mock("@/lib/observability/logger", () => ({
  logServerError: loggerMock.logServerError,
}));

import { searchProjectTaskIds } from "@/lib/services/project-task-search-service";

function searchableTask(overrides: Record<string, unknown> = {}) {
  return {
    id: "task-1",
    referenceNumber: 382,
    title: "Launch dashboard",
    description: "<p>Keyboard friendly board</p>",
    status: "In Progress",
    label: null,
    labelsJson: '["Frontend","Urgent"]',
    blockedNote: "Waiting for approval",
    comments: [{ content: "Remember the lighthouse audit" }],
    epic: { name: "Summer release" },
    assigneeUser: {
      name: "Ada Lovelace",
      email: "ada@example.com",
      username: "ada",
      usernameDiscriminator: "1843",
    },
    blockedFollowUps: [{ content: "Ask design on Monday" }],
    attachments: [{ name: "interaction-map.pdf" }],
    outgoingRelations: [{ rightTask: { title: "Publish release notes" } }],
    incomingRelations: [{ leftTask: { title: "Approve launch copy" } }],
    ...overrides,
  };
}

describe("project task search service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectAccessServiceMock.requireProjectRole.mockResolvedValue({
      ok: true,
      role: "viewer",
    });
    rlsContextMock.withActorRlsContext.mockImplementation(
      async (_actorUserId: string, operation: (db: typeof dbMock) => unknown) =>
        operation(dbMock)
    );
    dbMock.task.findMany.mockResolvedValue([searchableTask()]);
  });

  test.each([
    "LAUNCH DASHBOARD",
    "keyboard friendly",
    "nd-382",
    "in progress",
    "frontend",
    "waiting for approval",
    "lighthouse audit",
    "summer release",
    "ada lovelace",
    "ada#1843",
    "ask design",
    "interaction-map.pdf",
    "publish release notes",
    "approve launch copy",
  ])("matches required task text case-insensitively: %s", async (query) => {
    await expect(
      searchProjectTaskIds({
        actorUserId: "user-1",
        projectId: "project-1",
        query,
      })
    ).resolves.toEqual({ ok: true, data: { taskIds: ["task-1"] } });
  });

  test("searches only the requested authorized project, including archived rows", async () => {
    dbMock.task.findMany.mockResolvedValueOnce([
      searchableTask({ id: "archived-task", archivedAt: new Date() }),
    ]);

    const result = await searchProjectTaskIds({
      actorUserId: "viewer-1",
      projectId: "project-isolated",
      query: "launch",
    });

    expect(result).toEqual({ ok: true, data: { taskIds: ["archived-task"] } });
    expect(projectAccessServiceMock.requireProjectRole).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "viewer-1",
        projectId: "project-isolated",
        minimumRole: "viewer",
      })
    );
    expect(dbMock.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: "project-isolated" } })
    );
  });

  test("does not query tasks when project authorization fails", async () => {
    projectAccessServiceMock.requireProjectRole.mockResolvedValueOnce({
      ok: false,
      status: 404,
      error: "project-not-found",
    });

    await expect(
      searchProjectTaskIds({
        actorUserId: "outsider",
        projectId: "project-1",
        query: "launch",
      })
    ).resolves.toEqual({ ok: false, status: 404, error: "project-not-found" });
    expect(dbMock.task.findMany).not.toHaveBeenCalled();
  });

  test("validates trimmed query length", async () => {
    await expect(
      searchProjectTaskIds({
        actorUserId: "user-1",
        projectId: "project-1",
        query: "   ",
      })
    ).resolves.toEqual({ ok: false, status: 400, error: "query-required" });
    await expect(
      searchProjectTaskIds({
        actorUserId: "user-1",
        projectId: "project-1",
        query: "x".repeat(201),
      })
    ).resolves.toEqual({ ok: false, status: 400, error: "query-too-long" });
  });

  test("validates actor and project identifiers before opening RLS context", async () => {
    await expect(
      searchProjectTaskIds({
        actorUserId: " ",
        projectId: "project-1",
        query: "launch",
      })
    ).resolves.toEqual({ ok: false, status: 401, error: "unauthorized" });
    await expect(
      searchProjectTaskIds({
        actorUserId: "user-1",
        projectId: " ",
        query: "launch",
      })
    ).resolves.toEqual({ ok: false, status: 400, error: "project-required" });
    expect(rlsContextMock.withActorRlsContext).not.toHaveBeenCalled();
  });

  test("returns an empty ID list when no task text matches", async () => {
    await expect(
      searchProjectTaskIds({
        actorUserId: "user-1",
        projectId: "project-1",
        query: "definitely absent",
      })
    ).resolves.toEqual({ ok: true, data: { taskIds: [] } });
  });

  test("maps persistence failures without exposing task content", async () => {
    rlsContextMock.withActorRlsContext.mockRejectedValueOnce(
      new Error("database unavailable")
    );

    await expect(
      searchProjectTaskIds({
        actorUserId: "user-1",
        projectId: "project-1",
        query: "launch",
      })
    ).resolves.toEqual({ ok: false, status: 500, error: "task-search-failed" });
    expect(loggerMock.logServerError).toHaveBeenCalledWith(
      "searchProjectTaskIds",
      expect.any(Error),
      { actorUserId: "user-1", projectId: "project-1" }
    );
  });
});
