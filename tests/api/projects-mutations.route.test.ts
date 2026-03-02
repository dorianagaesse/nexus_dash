import { beforeEach, describe, expect, test, vi } from "vitest";

const projectServiceMock = vi.hoisted(() => ({
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
  getProjectMutationPayloadById: vi.fn(),
}));

vi.mock("@/lib/services/project-service", () => ({
  createProject: projectServiceMock.createProject,
  updateProject: projectServiceMock.updateProject,
  deleteProject: projectServiceMock.deleteProject,
  getProjectMutationPayloadById: projectServiceMock.getProjectMutationPayloadById,
}));

import { POST } from "@/app/api/projects/route";
import { DELETE, PATCH } from "@/app/api/projects/[projectId]/route";

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("project mutation routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("POST creates a project and returns mutation payload", async () => {
    projectServiceMock.createProject.mockResolvedValueOnce({ id: "p1" });
    projectServiceMock.getProjectMutationPayloadById.mockResolvedValueOnce({
      id: "p1",
      name: "Project 1",
      description: "Desc",
      updatedAt: "2026-03-01T12:00:00.000Z",
      taskCount: 0,
      resourceCount: 0,
    });

    const request = new Request("http://localhost/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: " Project 1 ",
        description: " Desc ",
      }),
    });

    const response = await POST(request as never);

    expect(response.status).toBe(201);
    await expect(readJson(response)).resolves.toEqual({
      project: {
        id: "p1",
        name: "Project 1",
        description: "Desc",
        updatedAt: "2026-03-01T12:00:00.000Z",
        taskCount: 0,
        resourceCount: 0,
      },
    });
    expect(projectServiceMock.createProject).toHaveBeenCalledWith({
      actorUserId: "test-user",
      name: "Project 1",
      description: "Desc",
    });
    expect(projectServiceMock.getProjectMutationPayloadById).toHaveBeenCalledWith({
      actorUserId: "test-user",
      projectId: "p1",
    });
  });

  test("POST validates project name length", async () => {
    const request = new Request("http://localhost/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "a",
      }),
    });

    const response = await POST(request as never);

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({ error: "name-too-short" });
    expect(projectServiceMock.createProject).not.toHaveBeenCalled();
  });

  test("PATCH updates a project and returns mutation payload", async () => {
    projectServiceMock.updateProject.mockResolvedValueOnce({});
    projectServiceMock.getProjectMutationPayloadById.mockResolvedValueOnce({
      id: "p1",
      name: "Project updated",
      description: "Desc",
      updatedAt: "2026-03-01T12:00:01.000Z",
      taskCount: 3,
      resourceCount: 2,
    });

    const request = new Request("http://localhost/api/projects/p1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: " Project updated ",
        description: " Desc ",
      }),
    });

    const response = await PATCH(request as never, {
      params: { projectId: "p1" },
    });

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({
      project: {
        id: "p1",
        name: "Project updated",
        description: "Desc",
        updatedAt: "2026-03-01T12:00:01.000Z",
        taskCount: 3,
        resourceCount: 2,
      },
    });
    expect(projectServiceMock.updateProject).toHaveBeenCalledWith({
      actorUserId: "test-user",
      projectId: "p1",
      name: "Project updated",
      description: "Desc",
    });
  });

  test("DELETE removes project and returns ok", async () => {
    projectServiceMock.deleteProject.mockResolvedValueOnce({});

    const response = await DELETE(new Request("http://localhost") as never, {
      params: { projectId: "p1" },
    });

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({ ok: true });
    expect(projectServiceMock.deleteProject).toHaveBeenCalledWith({
      actorUserId: "test-user",
      projectId: "p1",
    });
  });
});
