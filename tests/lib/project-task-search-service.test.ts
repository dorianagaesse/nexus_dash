import { beforeEach, describe, expect, test, vi } from "vitest";

const projectAccessServiceMock = vi.hoisted(() => ({
  requireProjectRole: vi.fn(),
  requireAgentProjectScopes: vi.fn(),
}));
const rlsContextMock = vi.hoisted(() => ({ withActorRlsContext: vi.fn() }));
const loggerMock = vi.hoisted(() => ({ logServerError: vi.fn() }));
const dbMock = vi.hoisted(() => ({ task: { findMany: vi.fn() } }));
const projectActorServiceMock = vi.hoisted(() => ({
  loadProjectActorRegistry: vi.fn(),
}));

vi.mock("@/lib/services/project-access-service", () => ({
  requireProjectRole: projectAccessServiceMock.requireProjectRole,
  requireAgentProjectScopes: projectAccessServiceMock.requireAgentProjectScopes,
}));
vi.mock("@/lib/services/rls-context", () => ({
  withActorRlsContext: rlsContextMock.withActorRlsContext,
}));
vi.mock("@/lib/observability/logger", () => ({
  logServerError: loggerMock.logServerError,
}));
vi.mock("@/lib/services/project-actor-service", () => ({
  loadProjectActorRegistry: projectActorServiceMock.loadProjectActorRegistry,
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
    comments: [{ content: "<p>Remember the</p><p>lighthouse audit</p>" }],
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
    projectAccessServiceMock.requireAgentProjectScopes.mockReturnValue({
      ok: true,
    });
    rlsContextMock.withActorRlsContext.mockImplementation(
      async (_actorUserId: string, operation: (db: typeof dbMock) => unknown) =>
        operation(dbMock)
    );
    dbMock.task.findMany.mockResolvedValue([searchableTask()]);
    projectActorServiceMock.loadProjectActorRegistry.mockResolvedValue(null);
  });

  test.each([
    "LAUNCH DASHBOARD",
    "keyboard friendly",
    "nd-382",
    "in progress",
    "frontend",
    "waiting for approval",
    "lighthouse audit",
    "the lighthouse",
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
    ).resolves.toEqual({
      ok: true,
      data: { taskIds: ["task-1"], totalMatches: 1, truncated: false },
    });
  });

  test("does not match rich-text comment markup", async () => {
    const result = await searchProjectTaskIds({
      actorUserId: "viewer-1",
      projectId: "project-1",
      query: "<p>",
    });

    expect(result).toEqual({
      ok: true,
      data: { taskIds: [], totalMatches: 0, truncated: false },
    });
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

    expect(result).toEqual({
      ok: true,
      data: { taskIds: ["archived-task"], totalMatches: 1, truncated: false },
    });
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

  test("matches agent-assigned tasks by their stored display-name snapshot", async () => {
    dbMock.task.findMany.mockResolvedValueOnce([
      searchableTask({
        assigneeUser: null,
        assigneeKind: "agent",
        assigneeCredentialId: "cred-1",
        assigneeDisplayNameSnapshot: "Release bot",
      }),
    ]);

    await expect(
      searchProjectTaskIds({
        actorUserId: "user-1",
        projectId: "project-1",
        query: "release bot",
      })
    ).resolves.toEqual({
      ok: true,
      data: { taskIds: ["task-1"], totalMatches: 1, truncated: false },
    });
    expect(projectActorServiceMock.loadProjectActorRegistry).toHaveBeenCalledWith(
      { db: dbMock, projectId: "project-1" }
    );
  });

  test("keeps revoked-credential assignments discoverable through the snapshot", async () => {
    dbMock.task.findMany.mockResolvedValueOnce([
      searchableTask({
        assigneeUser: null,
        assigneeKind: "agent",
        assigneeCredentialId: "cred-revoked",
        assigneeDisplayNameSnapshot: "Nightly sync bot",
      }),
    ]);

    await expect(
      searchProjectTaskIds({
        actorUserId: "user-1",
        projectId: "project-1",
        query: "nightly sync",
      })
    ).resolves.toEqual({
      ok: true,
      data: { taskIds: ["task-1"], totalMatches: 1, truncated: false },
    });
  });

  test("matches agent-assigned tasks by the live registry credential label", async () => {
    dbMock.task.findMany.mockResolvedValueOnce([
      searchableTask({
        assigneeUser: null,
        assigneeKind: "agent",
        assigneeCredentialId: "cred-1",
        assigneeDisplayNameSnapshot: "Release bot",
      }),
    ]);
    projectActorServiceMock.loadProjectActorRegistry.mockResolvedValueOnce({
      activeHumanIds: new Set<string>(),
      humanById: new Map(),
      credentialById: new Map([
        [
          "cred-1",
          { id: "cred-1", kind: "agent", displayName: "Release bot v2" },
        ],
      ]),
      assignable: [],
    });

    await expect(
      searchProjectTaskIds({
        actorUserId: "user-1",
        projectId: "project-1",
        query: "v2",
      })
    ).resolves.toEqual({
      ok: true,
      data: { taskIds: ["task-1"], totalMatches: 1, truncated: false },
    });
  });

  test("does not match agent snapshots on tasks without an agent assignee", async () => {
    dbMock.task.findMany.mockResolvedValueOnce([
      searchableTask({
        assigneeUser: null,
        assigneeKind: null,
        assigneeCredentialId: null,
        assigneeDisplayNameSnapshot: "Release bot",
      }),
    ]);

    await expect(
      searchProjectTaskIds({
        actorUserId: "user-1",
        projectId: "project-1",
        query: "release bot",
      })
    ).resolves.toEqual({
      ok: true,
      data: { taskIds: [], totalMatches: 0, truncated: false },
    });
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
    ).resolves.toEqual({
      ok: true,
      data: { taskIds: [], totalMatches: 0, truncated: false },
    });
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

  test("keeps session searches unbounded without an explicit limit", async () => {
    dbMock.task.findMany.mockResolvedValueOnce(
      Array.from({ length: 60 }, (_, index) =>
        searchableTask({ id: `task-${index}` })
      )
    );

    const result = await searchProjectTaskIds({
      actorUserId: "user-1",
      projectId: "project-1",
      query: "launch",
    });

    expect(result).toEqual({
      ok: true,
      data: {
        taskIds: Array.from({ length: 60 }, (_, index) => `task-${index}`),
        totalMatches: 60,
        truncated: false,
      },
    });
  });

  test("bounds agent searches to the default limit and reports truncation", async () => {
    dbMock.task.findMany.mockResolvedValueOnce(
      Array.from({ length: 60 }, (_, index) =>
        searchableTask({ id: `task-${index}` })
      )
    );

    const result = await searchProjectTaskIds({
      actorUserId: "owner-1",
      projectId: "project-1",
      query: "launch",
      agentAccess: {
        credentialId: "credential-1",
        projectId: "project-1",
        scopes: ["task:read"],
      },
    });

    expect(result).toEqual({
      ok: true,
      data: {
        taskIds: Array.from({ length: 50 }, (_, index) => `task-${index}`),
        totalMatches: 60,
        truncated: true,
      },
    });
  });

  test("honors an explicit limit for agent and session callers", async () => {
    const tasks = Array.from({ length: 10 }, (_, index) =>
      searchableTask({ id: `task-${index}` })
    );

    dbMock.task.findMany.mockResolvedValueOnce(tasks);
    const agentResult = await searchProjectTaskIds({
      actorUserId: "owner-1",
      projectId: "project-1",
      query: "launch",
      agentAccess: {
        credentialId: "credential-1",
        projectId: "project-1",
        scopes: ["task:read"],
      },
      limit: 5,
    });

    expect(agentResult).toEqual({
      ok: true,
      data: {
        taskIds: ["task-0", "task-1", "task-2", "task-3", "task-4"],
        totalMatches: 10,
        truncated: true,
      },
    });

    dbMock.task.findMany.mockResolvedValueOnce(tasks);
    const sessionResult = await searchProjectTaskIds({
      actorUserId: "user-1",
      projectId: "project-1",
      query: "launch",
      limit: 2,
    });

    expect(sessionResult).toEqual({
      ok: true,
      data: {
        taskIds: ["task-0", "task-1"],
        totalMatches: 10,
        truncated: true,
      },
    });
  });

  test("clamps explicit limits into the supported range", async () => {
    const tasks = Array.from({ length: 3 }, (_, index) =>
      searchableTask({ id: `task-${index}` })
    );

    dbMock.task.findMany.mockResolvedValueOnce(tasks);
    const oversized = await searchProjectTaskIds({
      actorUserId: "user-1",
      projectId: "project-1",
      query: "launch",
      limit: 999,
    });

    expect(oversized).toEqual({
      ok: true,
      data: {
        taskIds: ["task-0", "task-1", "task-2"],
        totalMatches: 3,
        truncated: false,
      },
    });

    dbMock.task.findMany.mockResolvedValueOnce(tasks);
    const undersized = await searchProjectTaskIds({
      actorUserId: "user-1",
      projectId: "project-1",
      query: "launch",
      limit: 0,
    });

    expect(undersized).toEqual({
      ok: true,
      data: { taskIds: ["task-0"], totalMatches: 3, truncated: true },
    });
  });

  test("rejects agent access without task:read scope before querying", async () => {
    projectAccessServiceMock.requireAgentProjectScopes.mockReturnValueOnce({
      ok: false,
      status: 403,
      error: "forbidden",
    });

    await expect(
      searchProjectTaskIds({
        actorUserId: "owner-1",
        projectId: "project-1",
        query: "launch",
        agentAccess: {
          credentialId: "credential-1",
          projectId: "project-1",
          scopes: ["project:read"],
        },
      })
    ).resolves.toEqual({ ok: false, status: 403, error: "forbidden" });
    expect(projectAccessServiceMock.requireAgentProjectScopes).toHaveBeenCalledWith({
      agentAccess: {
        credentialId: "credential-1",
        projectId: "project-1",
        scopes: ["project:read"],
      },
      projectId: "project-1",
      requiredScopes: ["task:read"],
    });
    expect(rlsContextMock.withActorRlsContext).not.toHaveBeenCalled();
    expect(dbMock.task.findMany).not.toHaveBeenCalled();
  });

  test("rejects cross-project agent access as not found", async () => {
    projectAccessServiceMock.requireAgentProjectScopes.mockReturnValueOnce({
      ok: false,
      status: 404,
      error: "project-not-found",
    });

    await expect(
      searchProjectTaskIds({
        actorUserId: "owner-1",
        projectId: "project-2",
        query: "launch",
        agentAccess: {
          credentialId: "credential-1",
          projectId: "project-1",
          scopes: ["task:read"],
        },
      })
    ).resolves.toEqual({ ok: false, status: 404, error: "project-not-found" });
    expect(dbMock.task.findMany).not.toHaveBeenCalled();
  });
});
