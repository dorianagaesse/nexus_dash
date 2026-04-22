import { beforeEach, describe, expect, test, vi } from "vitest";

const apiGuardMock = vi.hoisted(() => ({
  getAgentProjectAccessContext: vi.fn(),
  requireApiPrincipal: vi.fn(),
}));

const projectEpicServiceMock = vi.hoisted(() => ({
  listProjectEpics: vi.fn(),
  createProjectEpic: vi.fn(),
  updateProjectEpic: vi.fn(),
  deleteProjectEpic: vi.fn(),
}));

vi.mock("@/lib/auth/api-guard", () => ({
  getAgentProjectAccessContext: apiGuardMock.getAgentProjectAccessContext,
  requireApiPrincipal: apiGuardMock.requireApiPrincipal,
}));

vi.mock("@/lib/services/project-epic-service", () => ({
  listProjectEpics: projectEpicServiceMock.listProjectEpics,
  createProjectEpic: projectEpicServiceMock.createProjectEpic,
  updateProjectEpic: projectEpicServiceMock.updateProjectEpic,
  deleteProjectEpic: projectEpicServiceMock.deleteProjectEpic,
}));

import {
  GET as getEpics,
  POST as createEpic,
} from "@/app/api/projects/[projectId]/epics/route";
import {
  DELETE as deleteEpic,
  PATCH as updateEpic,
} from "@/app/api/projects/[projectId]/epics/[epicId]/route";

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

function projectParams(projectId: string) {
  return { params: Promise.resolve({ projectId }) };
}

function epicParams(projectId: string, epicId: string) {
  return { params: Promise.resolve({ projectId, epicId }) };
}

describe("project epic routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiGuardMock.requireApiPrincipal.mockResolvedValue({
      ok: true,
      principal: {
        kind: "human",
        actorUserId: "user-1",
        requestId: "request-1",
      },
    });
    apiGuardMock.getAgentProjectAccessContext.mockReturnValue(undefined);
  });

  test("GET /api/projects/:projectId/epics returns serialized epic data", async () => {
    projectEpicServiceMock.listProjectEpics.mockResolvedValueOnce([
      {
        id: "epic-1",
        name: "Workspace launch",
        description: "Deliver the first launch slice.",
        status: "In progress",
        progressPercent: 50,
        taskCount: 4,
        completedTaskCount: 2,
        linkedTasks: [
          {
            id: "task-1",
            title: "Ship hero",
            status: "Done",
            archivedAt: null,
          },
        ],
        createdAt: new Date("2026-04-20T08:00:00.000Z"),
        updatedAt: new Date("2026-04-21T09:00:00.000Z"),
      },
    ]);

    const response = await getEpics(
      new Request("http://localhost/api/projects/p1/epics") as never,
      projectParams("p1")
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({
      epics: [
        {
          id: "epic-1",
          name: "Workspace launch",
          description: "Deliver the first launch slice.",
          status: "In progress",
          progressPercent: 50,
          taskCount: 4,
          completedTaskCount: 2,
          linkedTasks: [
            {
              id: "task-1",
              title: "Ship hero",
              status: "Done",
              archivedAt: null,
            },
          ],
          createdAt: "2026-04-20T08:00:00.000Z",
          updatedAt: "2026-04-21T09:00:00.000Z",
        },
      ],
    });
    expect(projectEpicServiceMock.listProjectEpics).toHaveBeenCalledWith(
      "p1",
      "user-1",
      undefined
    );
  });

  test("POST /api/projects/:projectId/epics returns 400 for invalid json", async () => {
    const response = await createEpic(
      new Request("http://localhost/api/projects/p1/epics", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: "{",
      }) as never,
      projectParams("p1")
    );

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({
      error: "invalid-json",
    });
    expect(projectEpicServiceMock.createProjectEpic).not.toHaveBeenCalled();
  });

  test("POST /api/projects/:projectId/epics creates an epic", async () => {
    projectEpicServiceMock.createProjectEpic.mockResolvedValueOnce({
      ok: true,
      data: {
        epic: {
          id: "epic-1",
          name: "Workspace launch",
          description: "Deliver the first launch slice.",
          status: "Ready",
          progressPercent: 0,
          taskCount: 0,
          completedTaskCount: 0,
          linkedTasks: [],
          createdAt: new Date("2026-04-20T08:00:00.000Z"),
          updatedAt: new Date("2026-04-20T08:00:00.000Z"),
        },
      },
    });

    const response = await createEpic(
      new Request("http://localhost/api/projects/p1/epics", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "Workspace launch",
          description: "Deliver the first launch slice.",
        }),
      }) as never,
      projectParams("p1")
    );

    expect(response.status).toBe(201);
    await expect(readJson(response)).resolves.toEqual({
      epic: {
        id: "epic-1",
        name: "Workspace launch",
        description: "Deliver the first launch slice.",
        status: "Ready",
        progressPercent: 0,
        taskCount: 0,
        completedTaskCount: 0,
        linkedTasks: [],
        createdAt: "2026-04-20T08:00:00.000Z",
        updatedAt: "2026-04-20T08:00:00.000Z",
      },
    });
    expect(projectEpicServiceMock.createProjectEpic).toHaveBeenCalledWith({
      actorUserId: "user-1",
      projectId: "p1",
      name: "Workspace launch",
      description: "Deliver the first launch slice.",
      agentAccess: undefined,
    });
  });

  test("PATCH /api/projects/:projectId/epics/:epicId updates an epic", async () => {
    projectEpicServiceMock.updateProjectEpic.mockResolvedValueOnce({
      ok: true,
      data: {
        epic: {
          id: "epic-1",
          name: "Workspace launch",
          description: "Refined description.",
          status: "In progress",
          progressPercent: 25,
          taskCount: 4,
          completedTaskCount: 1,
          linkedTasks: [],
          createdAt: new Date("2026-04-20T08:00:00.000Z"),
          updatedAt: new Date("2026-04-22T10:00:00.000Z"),
        },
      },
    });

    const response = await updateEpic(
      new Request("http://localhost/api/projects/p1/epics/epic-1", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "Workspace launch",
          description: "Refined description.",
        }),
      }) as never,
      epicParams("p1", "epic-1")
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({
      epic: {
        id: "epic-1",
        name: "Workspace launch",
        description: "Refined description.",
        status: "In progress",
        progressPercent: 25,
        taskCount: 4,
        completedTaskCount: 1,
        linkedTasks: [],
        createdAt: "2026-04-20T08:00:00.000Z",
        updatedAt: "2026-04-22T10:00:00.000Z",
      },
    });
  });

  test("DELETE /api/projects/:projectId/epics/:epicId deletes an epic", async () => {
    projectEpicServiceMock.deleteProjectEpic.mockResolvedValueOnce({
      ok: true,
      data: { ok: true },
    });

    const response = await deleteEpic(
      new Request("http://localhost/api/projects/p1/epics/epic-1", {
        method: "DELETE",
      }) as never,
      epicParams("p1", "epic-1")
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({ ok: true });
    expect(projectEpicServiceMock.deleteProjectEpic).toHaveBeenCalledWith({
      actorUserId: "user-1",
      projectId: "p1",
      epicId: "epic-1",
      agentAccess: undefined,
    });
  });
});
