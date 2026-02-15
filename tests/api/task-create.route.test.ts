import { beforeEach, describe, expect, test, vi } from "vitest";

const projectTaskServiceMock = vi.hoisted(() => ({
  createTaskForProject: vi.fn(),
}));

vi.mock("@/lib/services/project-task-service", () => ({
  createTaskForProject: projectTaskServiceMock.createTaskForProject,
}));

import { POST } from "@/app/api/projects/[projectId]/tasks/route";

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("POST /api/projects/:projectId/tasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns 400 when project id is missing", async () => {
    const request = new Request("http://localhost/api/projects//tasks", {
      method: "POST",
      body: new FormData(),
    });

    const response = await POST(request as never, {
      params: { projectId: "" },
    });

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({
      error: "Missing project id",
    });
    expect(projectTaskServiceMock.createTaskForProject).not.toHaveBeenCalled();
  });

  test("creates task from multipart form payload", async () => {
    projectTaskServiceMock.createTaskForProject.mockResolvedValueOnce({
      ok: true,
      data: { id: "task-created" },
    });

    const formData = new FormData();
    formData.set("title", "  New Task  ");
    formData.set("description", "  Description  ");
    formData.set("labels", '["backend"]');
    formData.set(
      "attachmentLinks",
      '[{"name":"Docs","url":"https://example.com"}]'
    );
    formData.append(
      "attachmentFiles",
      new File(["hello"], "note.txt", { type: "text/plain" })
    );

    const request = new Request("http://localhost/api/projects/p1/tasks", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request as never, {
      params: { projectId: "p1" },
    });

    expect(response.status).toBe(201);
    await expect(readJson(response)).resolves.toEqual({ taskId: "task-created" });
    expect(projectTaskServiceMock.createTaskForProject).toHaveBeenCalledTimes(1);

    const call = projectTaskServiceMock.createTaskForProject.mock.calls[0][0];
    expect(call.projectId).toBe("p1");
    expect(call.title).toBe("New Task");
    expect(call.description).toBe("Description");
    expect(call.labelsJsonRaw).toBe('["backend"]');
    expect(call.attachmentLinksJsonRaw).toBe(
      '[{"name":"Docs","url":"https://example.com"}]'
    );
    expect(Array.isArray(call.attachmentFiles)).toBe(true);
    expect(call.attachmentFiles).toHaveLength(1);
  });

  test("returns mapped error from service", async () => {
    projectTaskServiceMock.createTaskForProject.mockResolvedValueOnce({
      ok: false,
      status: 400,
      error: "title-too-short",
    });

    const formData = new FormData();
    formData.set("title", "a");

    const request = new Request("http://localhost/api/projects/p1/tasks", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request as never, {
      params: { projectId: "p1" },
    });

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({
      error: "title-too-short",
    });
  });
});
