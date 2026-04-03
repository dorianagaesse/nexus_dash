import { beforeEach, describe, expect, test, vi } from "vitest";

const apiGuardMock = vi.hoisted(() => ({
  getAgentProjectAccessContext: vi.fn(),
  requireApiPrincipal: vi.fn(),
  requireAuthenticatedApiUser: vi.fn(),
}));

const projectAccessServiceMock = vi.hoisted(() => ({
  requireAgentProjectScopes: vi.fn(),
}));

const projectServiceMock = vi.hoisted(() => ({
  getProjectSummaryById: vi.fn(),
  listProjectContextResources: vi.fn(),
  listProjectKanbanTasks: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
}));

const projectTaskServiceMock = vi.hoisted(() => ({
  createTaskForProject: vi.fn(),
}));

const contextCardServiceMock = vi.hoisted(() => ({
  createContextCardForProject: vi.fn(),
}));

vi.mock("@/lib/auth/api-guard", () => ({
  getAgentProjectAccessContext: apiGuardMock.getAgentProjectAccessContext,
  requireApiPrincipal: apiGuardMock.requireApiPrincipal,
  requireAuthenticatedApiUser: apiGuardMock.requireAuthenticatedApiUser,
}));

vi.mock("@/lib/services/project-access-service", () => ({
  requireAgentProjectScopes: projectAccessServiceMock.requireAgentProjectScopes,
}));

vi.mock("@/lib/services/project-service", () => ({
  getProjectSummaryById: projectServiceMock.getProjectSummaryById,
  listProjectContextResources: projectServiceMock.listProjectContextResources,
  listProjectKanbanTasks: projectServiceMock.listProjectKanbanTasks,
  updateProject: projectServiceMock.updateProject,
  deleteProject: projectServiceMock.deleteProject,
}));

vi.mock("@/lib/services/project-task-service", () => ({
  createTaskForProject: projectTaskServiceMock.createTaskForProject,
}));

vi.mock("@/lib/services/context-card-service", () => ({
  createContextCardForProject: contextCardServiceMock.createContextCardForProject,
}));

import { GET as getProject } from "@/app/api/projects/[projectId]/route";
import { GET as getTasks } from "@/app/api/projects/[projectId]/tasks/route";
import { GET as getContextCards } from "@/app/api/projects/[projectId]/context-cards/route";

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("agent project routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiGuardMock.requireApiPrincipal.mockResolvedValue({
      ok: true,
      principal: {
        kind: "agent",
        actorUserId: "owner-1",
        ownerUserId: "owner-1",
        credentialId: "credential-1",
        projectId: "project-1",
        scopes: ["project:read", "task:read", "context:read"],
        tokenId: "token-1",
        requestId: "request-1",
      },
    });
    apiGuardMock.getAgentProjectAccessContext.mockReturnValue({
      credentialId: "credential-1",
      projectId: "project-1",
      scopes: ["project:read", "task:read", "context:read"],
    });
    projectAccessServiceMock.requireAgentProjectScopes.mockReturnValue({ ok: true });
  });

  test("GET /api/projects/:projectId returns project summary for valid agent scope", async () => {
    projectServiceMock.getProjectSummaryById.mockResolvedValueOnce({
      id: "project-1",
      name: "Project One",
      description: "Desc",
      stats: {
        trackedTasks: 4,
        openTasks: 2,
        completedTasks: 1,
        contextCards: 3,
        attachmentCount: 0,
        isCalendarConnected: false,
      },
    });

    const response = await getProject(
      new Request("http://localhost/api/projects/project-1") as never,
      { params: { projectId: "project-1" } }
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({
      project: {
        id: "project-1",
        name: "Project One",
        description: "Desc",
        stats: {
          trackedTasks: 4,
          openTasks: 2,
          completedTasks: 1,
          contextCards: 3,
        },
      },
    });
    expect(projectAccessServiceMock.requireAgentProjectScopes).toHaveBeenCalledWith({
      agentAccess: {
        credentialId: "credential-1",
        projectId: "project-1",
        scopes: ["project:read", "task:read", "context:read"],
      },
      projectId: "project-1",
      requiredScopes: ["project:read"],
    });
    expect(projectServiceMock.getProjectSummaryById).toHaveBeenCalledWith(
      "project-1",
      "owner-1",
      {
        credentialId: "credential-1",
        projectId: "project-1",
        scopes: ["project:read", "task:read", "context:read"],
      }
    );
  });

  test("GET /api/projects/:projectId returns not-found for cross-project agent access", async () => {
    projectAccessServiceMock.requireAgentProjectScopes.mockReturnValueOnce({
      ok: false,
      status: 404,
      error: "project-not-found",
    });

    const response = await getProject(
      new Request("http://localhost/api/projects/project-2") as never,
      { params: { projectId: "project-2" } }
    );

    expect(response.status).toBe(404);
    await expect(readJson(response)).resolves.toEqual({
      error: "project-not-found",
    });
    expect(projectServiceMock.getProjectSummaryById).not.toHaveBeenCalled();
  });

  test("GET /api/projects/:projectId/tasks returns attachment metadata for agent callers", async () => {
    projectServiceMock.listProjectKanbanTasks.mockResolvedValueOnce([
      {
        id: "task-1",
        title: "Draft API quickstart",
        description: "<p>Write the onboarding flow.</p>",
        blockedNote: null,
        completedAt: null,
        archivedAt: null,
        status: "Todo",
        position: 1,
        label: null,
        labelsJson: '["docs"]',
        createdAt: "2026-04-03T09:00:00.000Z",
        updatedAt: "2026-04-03T10:00:00.000Z",
        attachments: [
          {
            id: "att-1",
            kind: "file",
            name: "diagram.png",
            url: null,
            mimeType: "image/png",
            sizeBytes: 2048,
          },
        ],
        outgoingRelations: [],
        incomingRelations: [],
        blockedFollowUps: [],
      },
    ]);

    const response = await getTasks(
      new Request("http://localhost/api/projects/project-1/tasks") as never,
      { params: { projectId: "project-1" } }
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({
      tasks: [
        {
          id: "task-1",
          title: "Draft API quickstart",
          description: "<p>Write the onboarding flow.</p>",
          blockedNote: null,
          completedAt: null,
          archivedAt: null,
          status: "Todo",
          position: 1,
          label: null,
          labelsJson: '["docs"]',
          createdAt: "2026-04-03T09:00:00.000Z",
          updatedAt: "2026-04-03T10:00:00.000Z",
          attachments: [
            {
              id: "att-1",
              kind: "file",
              name: "diagram.png",
              url: null,
              mimeType: "image/png",
              sizeBytes: 2048,
              downloadUrl:
                "/api/projects/project-1/tasks/task-1/attachments/att-1/download",
            },
          ],
          relatedTasks: [],
          blockedFollowUps: [],
        },
      ],
    });
  });

  test("GET /api/projects/:projectId/tasks returns forbidden when agent lacks task read", async () => {
    projectAccessServiceMock.requireAgentProjectScopes.mockReturnValueOnce({
      ok: false,
      status: 403,
      error: "forbidden",
    });

    const response = await getTasks(
      new Request("http://localhost/api/projects/project-1/tasks") as never,
      { params: { projectId: "project-1" } }
    );

    expect(response.status).toBe(403);
    await expect(readJson(response)).resolves.toEqual({
      error: "forbidden",
    });
    expect(projectServiceMock.listProjectKanbanTasks).not.toHaveBeenCalled();
  });

  test("GET /api/projects/:projectId/context-cards returns mapped cards for human callers too", async () => {
    apiGuardMock.requireApiPrincipal.mockResolvedValueOnce({
      ok: true,
      principal: {
        kind: "human",
        actorUserId: "user-1",
        requestId: "request-1",
      },
    });
    apiGuardMock.getAgentProjectAccessContext.mockReturnValueOnce(undefined);
    projectServiceMock.listProjectContextResources.mockResolvedValueOnce([
      {
        id: "card-1",
        name: "Sprint notes",
        content: "<p>Rich text</p>",
        color: "#abc",
        createdAt: "2026-03-31T09:00:00.000Z",
        attachments: [
          {
            id: "context-att-1",
            kind: "file",
            name: "brief.png",
            url: null,
            mimeType: "image/png",
            sizeBytes: 512,
          },
        ],
      },
    ]);

    const response = await getContextCards(
      new Request("http://localhost/api/projects/project-1/context-cards") as never,
      { params: { projectId: "project-1" } }
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({
      cards: [
        {
          id: "card-1",
          title: "Sprint notes",
          content: "<p>Rich text</p>",
          color: "#abc",
          createdAt: "2026-03-31T09:00:00.000Z",
          attachments: [
            {
              id: "context-att-1",
              kind: "file",
              name: "brief.png",
              url: null,
              mimeType: "image/png",
              sizeBytes: 512,
              downloadUrl:
                "/api/projects/project-1/context-cards/card-1/attachments/context-att-1/download",
            },
          ],
        },
      ],
    });
    expect(projectAccessServiceMock.requireAgentProjectScopes).toHaveBeenCalledWith({
      agentAccess: undefined,
      projectId: "project-1",
      requiredScopes: ["context:read"],
    });
    expect(projectServiceMock.listProjectContextResources).toHaveBeenCalledWith(
      "project-1",
      "user-1",
      undefined
    );
  });
});
