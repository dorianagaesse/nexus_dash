import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const apiGuardMock = vi.hoisted(() => ({
  getAgentProjectAccessContext: vi.fn(),
  requireApiPrincipal: vi.fn(),
}));

const projectAccessServiceMock = vi.hoisted(() => ({
  requireAgentProjectScopes: vi.fn(),
}));

const projectServiceMock = vi.hoisted(() => ({
  listProjectKanbanTasks: vi.fn(),
}));

const projectActorServiceMock = vi.hoisted(() => ({
  loadProjectActorRegistryForActor: vi.fn(),
}));

const projectTaskServiceMock = vi.hoisted(() => ({
  createTaskForProject: vi.fn(),
  parseTaskAssigneeInput: vi.fn(),
  validateTaskCreateFieldTypes: vi.fn(),
}));

const projectTaskResponseMock = vi.hoisted(() => ({
  mapProjectKanbanTaskToTaskResponse: vi.fn((task: unknown) => task),
}));

vi.mock("@/lib/auth/api-guard", () => ({
  getAgentProjectAccessContext: apiGuardMock.getAgentProjectAccessContext,
  requireApiPrincipal: apiGuardMock.requireApiPrincipal,
}));

vi.mock("@/lib/services/project-access-service", () => ({
  requireAgentProjectScopes: projectAccessServiceMock.requireAgentProjectScopes,
}));

vi.mock("@/lib/services/project-service", () => ({
  listProjectKanbanTasks: projectServiceMock.listProjectKanbanTasks,
}));

vi.mock("@/lib/services/project-actor-service", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("@/lib/services/project-actor-service")
    >();
  return {
    ...original,
    loadProjectActorRegistryForActor:
      projectActorServiceMock.loadProjectActorRegistryForActor,
  };
});

vi.mock("@/lib/services/project-task-service", () => ({
  createTaskForProject: projectTaskServiceMock.createTaskForProject,
  parseTaskAssigneeInput: projectTaskServiceMock.parseTaskAssigneeInput,
  validateTaskCreateFieldTypes:
    projectTaskServiceMock.validateTaskCreateFieldTypes,
}));

vi.mock("@/lib/services/project-task-response", () => ({
  mapProjectKanbanTaskToTaskResponse:
    projectTaskResponseMock.mapProjectKanbanTaskToTaskResponse,
}));

vi.mock("@/lib/services/project-attachment-service", () => ({
  mapTaskAttachmentResponse: vi.fn(
    (projectId: string, taskId: string, attachment: Record<string, unknown>) => ({
      ...attachment,
      downloadUrl: null,
    })
  ),
}));

import { GET } from "@/app/api/projects/[projectId]/tasks/route";

function listRequest(query = "") {
  return new NextRequest(
    `http://localhost/api/projects/project-1/tasks${query}`
  );
}

function routeParams() {
  return { params: Promise.resolve({ projectId: "project-1" }) };
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

function mockHumanPrincipal() {
  apiGuardMock.requireApiPrincipal.mockResolvedValue({
    ok: true,
    principal: {
      kind: "human",
      actorUserId: "test-user",
      requestId: "request-1",
    },
  });
  apiGuardMock.getAgentProjectAccessContext.mockReturnValue(undefined);
}

function mockAgentPrincipal() {
  apiGuardMock.requireApiPrincipal.mockResolvedValue({
    ok: true,
    principal: {
      kind: "agent",
      actorUserId: "owner-1",
      ownerUserId: "owner-1",
      credentialId: "credential-1",
      projectId: "project-1",
      scopes: ["task:read"],
      tokenId: "token-1",
      requestId: "request-1",
    },
  });
  apiGuardMock.getAgentProjectAccessContext.mockReturnValue({
    credentialId: "credential-1",
    projectId: "project-1",
    scopes: ["task:read"],
  });
}

describe("GET /api/projects/:projectId/tasks filters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHumanPrincipal();
    projectAccessServiceMock.requireAgentProjectScopes.mockReturnValue({
      ok: true,
    });
    projectServiceMock.listProjectKanbanTasks.mockResolvedValue([]);
    projectActorServiceMock.loadProjectActorRegistryForActor.mockResolvedValue(
      null
    );
  });

  test("resolves human assignee=self and echoes normalized filters", async () => {
    const response = await GET(
      listRequest("?assignee=self&sort=recent&limit=25&epicId=epic-1&label=Docs"),
      routeParams()
    );

    expect(response.status).toBe(200);
    expect(projectServiceMock.listProjectKanbanTasks).toHaveBeenCalledWith(
      "project-1",
      "test-user",
      undefined,
      {
        epicId: "epic-1",
        label: "Docs",
        assignee: { kind: "human", id: "test-user" },
        sort: "recent",
        limit: 25,
      }
    );
    await expect(readJson(response)).resolves.toEqual({
      filters: {
        epicId: "epic-1",
        label: "Docs",
        assignee: "self",
        sort: "recent",
        limit: 25,
      },
      tasks: [],
    });
  });

  test("resolves agent assignee=self to the credential id", async () => {
    mockAgentPrincipal();

    const response = await GET(
      listRequest("?assignee=self&sort=recent"),
      routeParams()
    );

    expect(response.status).toBe(200);
    expect(projectServiceMock.listProjectKanbanTasks).toHaveBeenCalledWith(
      "project-1",
      "owner-1",
      {
        credentialId: "credential-1",
        projectId: "project-1",
        scopes: ["task:read"],
      },
      {
        assignee: { kind: "agent", id: "credential-1" },
        sort: "recent",
      }
    );
    await expect(readJson(response)).resolves.toEqual({
      filters: { epicId: null, label: null, assignee: "self", sort: "recent", limit: null },
      tasks: [],
    });
  });

  test("passes assignee=unassigned through and clamps oversized limits", async () => {
    const response = await GET(
      listRequest("?assignee=unassigned&limit=500"),
      routeParams()
    );

    expect(response.status).toBe(200);
    expect(projectServiceMock.listProjectKanbanTasks).toHaveBeenCalledWith(
      "project-1",
      "test-user",
      undefined,
      { assignee: "unassigned", limit: 200 }
    );
    const payload = (await readJson(response)) as {
      filters: Record<string, unknown>;
    };
    expect(payload.filters).toEqual({
      epicId: null,
      label: null,
      assignee: "unassigned",
      sort: null,
      limit: 200,
    });
  });

  test("omits filters and echoes nulls when no params are given", async () => {
    const response = await GET(listRequest(), routeParams());

    expect(response.status).toBe(200);
    expect(projectServiceMock.listProjectKanbanTasks).toHaveBeenCalledWith(
      "project-1",
      "test-user",
      undefined,
      undefined
    );
    const payload = (await readJson(response)) as {
      filters: Record<string, unknown>;
    };
    expect(payload.filters).toEqual({
      epicId: null,
      label: null,
      assignee: null,
      sort: null,
      limit: null,
    });
  });

  test("rejects invalid assignee, sort, and limit values", async () => {
    const cases = [
      { query: "?assignee=me", error: "invalid-assignee" },
      { query: "?sort=oldest", error: "invalid-sort" },
      { query: "?limit=abc", error: "invalid-limit" },
    ];

    for (const entry of cases) {
      const response = await GET(listRequest(entry.query), routeParams());

      expect(response.status).toBe(400);
      await expect(readJson(response)).resolves.toEqual({
        error: entry.error,
      });
    }
    expect(projectServiceMock.listProjectKanbanTasks).not.toHaveBeenCalled();
  });
});
