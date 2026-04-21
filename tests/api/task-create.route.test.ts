import { beforeEach, describe, expect, test, vi } from "vitest";

const apiGuardMock = vi.hoisted(() => ({
  getAgentProjectAccessContext: vi.fn(),
  requireApiPrincipal: vi.fn(),
}));

const projectTaskServiceMock = vi.hoisted(() => ({
  createTaskForProject: vi.fn(),
}));

vi.mock("@/lib/auth/api-guard", () => ({
  getAgentProjectAccessContext: apiGuardMock.getAgentProjectAccessContext,
  requireApiPrincipal: apiGuardMock.requireApiPrincipal,
}));

vi.mock("@/lib/services/project-task-service", () => ({
  createTaskForProject: projectTaskServiceMock.createTaskForProject,
}));

vi.mock("@/lib/services/project-attachment-service", () => ({
  mapTaskAttachmentResponse: vi.fn((projectId: string, taskId: string, attachment: Record<string, unknown>) => ({
    ...attachment,
    downloadUrl:
      attachment.kind === "file"
        ? `/api/projects/${projectId}/tasks/${taskId}/attachments/${attachment.id}/download`
        : null,
  })),
}));

vi.mock("@/lib/services/project-service", () => ({
  listProjectKanbanTasks: vi.fn(),
}));

vi.mock("@/lib/services/project-access-service", () => ({
  requireAgentProjectScopes: vi.fn(() => ({ ok: true })),
}));

import { POST } from "@/app/api/projects/[projectId]/tasks/route";

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("POST /api/projects/:projectId/tasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiGuardMock.requireApiPrincipal.mockResolvedValue({
      ok: true,
      principal: {
        kind: "human",
        actorUserId: "test-user",
        requestId: "request-1",
      },
    });
    apiGuardMock.getAgentProjectAccessContext.mockReturnValue(undefined);
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
    formData.set("deadlineDate", "2026-04-24");
    formData.set("assigneeUserId", "user-2");
    formData.set("labels", '["backend"]');
    formData.set("relatedTaskIds", '["task-a","task-b"]');
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
    expect(call.deadlineDate).toBe("2026-04-24");
    expect(call.assigneeUserId).toBe("user-2");
    expect(call.labelsJsonRaw).toBe('["backend"]');
    expect(call.relatedTaskIdsJsonRaw).toBe('["task-a","task-b"]');
    expect(call.attachmentLinksJsonRaw).toBe(
      '[{"name":"Docs","url":"https://example.com"}]'
    );
    expect(call.agentAccess).toBeUndefined();
    expect(Array.isArray(call.attachmentFiles)).toBe(true);
    expect(call.attachmentFiles).toHaveLength(1);
  });

  test("creates task from json payload for agent-first callers", async () => {
    projectTaskServiceMock.createTaskForProject.mockResolvedValueOnce({
      ok: true,
      data: { id: "task-json" },
    });

    const request = new Request("http://localhost/api/projects/p1/tasks", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "  Draft API smoke test  ",
        description: "  <p>Validate the agent route.</p>  ",
        deadlineDate: "2026-04-25",
        assigneeUserId: "user-2",
        labels: ["agent", "qa"],
        relatedTaskIds: ["task-a"],
        attachmentLinks: [{ name: "Spec", url: "https://example.com/spec" }],
      }),
    });

    const response = await POST(request as never, {
      params: { projectId: "p1" },
    });

    expect(response.status).toBe(201);
    await expect(readJson(response)).resolves.toEqual({ taskId: "task-json" });
    expect(projectTaskServiceMock.createTaskForProject).toHaveBeenCalledWith({
      actorUserId: "test-user",
      projectId: "p1",
      title: "Draft API smoke test",
      description: "<p>Validate the agent route.</p>",
      deadlineDate: "2026-04-25",
      assigneeUserId: "user-2",
      labelsJsonRaw: '["agent","qa"]',
      relatedTaskIdsJsonRaw: '["task-a"]',
      attachmentLinksJsonRaw:
        '[{"name":"Spec","url":"https://example.com/spec"}]',
      attachmentFiles: [],
      agentAccess: undefined,
    });
  });

  test("returns 400 when json deadlineDate is not a string", async () => {
    const request = new Request("http://localhost/api/projects/p1/tasks", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Draft API smoke test",
        deadlineDate: 123,
      }),
    });

    const response = await POST(request as never, {
      params: { projectId: "p1" },
    });

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({
      error: "deadline-invalid",
    });
    expect(projectTaskServiceMock.createTaskForProject).not.toHaveBeenCalled();
  });

  test("returns 400 when json assigneeUserId is not a string", async () => {
    const request = new Request("http://localhost/api/projects/p1/tasks", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Draft API smoke test",
        assigneeUserId: 123,
      }),
    });

    const response = await POST(request as never, {
      params: { projectId: "p1" },
    });

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({
      error: "assignee-invalid",
    });
    expect(projectTaskServiceMock.createTaskForProject).not.toHaveBeenCalled();
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

  test("rejects file attachments for agent callers", async () => {
    apiGuardMock.requireApiPrincipal.mockResolvedValueOnce({
      ok: true,
      principal: {
        kind: "agent",
        actorUserId: "owner-1",
        ownerUserId: "owner-1",
        credentialId: "credential-1",
        projectId: "p1",
        scopes: ["task:write"],
        tokenId: "token-1",
        requestId: "request-1",
      },
    });
    apiGuardMock.getAgentProjectAccessContext.mockReturnValueOnce({
      credentialId: "credential-1",
      projectId: "p1",
      scopes: ["task:write"],
    });

    const formData = new FormData();
    formData.set("title", "Agent Task");
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

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({
      error: "agent-file-attachments-not-supported",
    });
    expect(projectTaskServiceMock.createTaskForProject).not.toHaveBeenCalled();
  });

  test("returns 400 for invalid json payloads", async () => {
    const request = new Request("http://localhost/api/projects/p1/tasks", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: "{",
    });

    const response = await POST(request as never, {
      params: { projectId: "p1" },
    });

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({
      error: "Invalid JSON payload",
    });
    expect(projectTaskServiceMock.createTaskForProject).not.toHaveBeenCalled();
  });
});
