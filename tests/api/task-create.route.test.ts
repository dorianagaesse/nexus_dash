import { beforeEach, describe, expect, test, vi } from "vitest";

const apiGuardMock = vi.hoisted(() => ({
  getAgentProjectAccessContext: vi.fn(),
  requireApiPrincipal: vi.fn(),
}));

const projectTaskServiceMock = vi.hoisted(() => ({
  createTaskForProject: vi.fn(),
}));

const projectServiceMock = vi.hoisted(() => ({
  listProjectKanbanTasks: vi.fn(),
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
  listProjectKanbanTasks: projectServiceMock.listProjectKanbanTasks,
}));

vi.mock("@/lib/services/project-access-service", () => ({
  requireAgentProjectScopes: vi.fn(() => ({ ok: true })),
}));

import { GET, POST } from "@/app/api/projects/[projectId]/tasks/route";

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

function taskRouteParams(projectId: string) {
  return { params: Promise.resolve({ projectId }) };
}

describe("GET /api/projects/:projectId/tasks", () => {
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

  test("serializes incoming and outgoing relations once in both task directions", async () => {
    const relatedTask = {
      id: "task-b",
      title: "Task B",
      status: "Done",
      archivedAt: new Date("2026-07-29T08:00:00.000Z"),
    };
    projectServiceMock.listProjectKanbanTasks.mockResolvedValueOnce([
      {
        id: "task-a",
        referenceNumber: 42,
        title: "Task A",
        description: null,
        blockedNote: null,
        deadlineAt: null,
        _count: { comments: 0 },
        completedAt: null,
        archivedAt: null,
        status: "Backlog",
        position: 0,
        label: null,
        labelsJson: null,
        createdAt: new Date("2026-07-30T08:00:00.000Z"),
        updatedAt: new Date("2026-07-30T08:00:00.000Z"),
        epic: null,
        assigneeUser: null,
        createdByUser: null,
        updatedByUser: null,
        attachments: [],
        outgoingRelations: [{ rightTask: relatedTask }],
        incomingRelations: [{ leftTask: relatedTask }],
        blockedFollowUps: [],
      },
    ]);

    const response = await GET(
      new Request("http://localhost/api/projects/p1/tasks") as never,
      taskRouteParams("p1")
    );
    const payload = (await response.json()) as {
      tasks: Array<{ reference: string; relatedTasks: unknown[] }>;
    };

    expect(response.status).toBe(200);
    expect(payload.tasks[0]?.reference).toBe("ND-42");
    expect(payload.tasks[0]?.relatedTasks).toEqual([
      {
        id: "task-b",
        title: "Task B",
        status: "Done",
        archivedAt: "2026-07-29T08:00:00.000Z",
      },
    ]);
  });

  test("serializes canonical labels arrays with empty, multi-label, and legacy fallbacks", async () => {
    const baseTask = {
      id: "task-base",
      referenceNumber: 1,
      title: "Task",
      description: null,
      blockedNote: null,
      deadlineAt: null,
      _count: { comments: 0 },
      completedAt: null,
      archivedAt: null,
      status: "Backlog",
      position: 0,
      createdAt: new Date("2026-07-30T08:00:00.000Z"),
      updatedAt: new Date("2026-07-30T08:00:00.000Z"),
      epic: null,
      assigneeUser: null,
      createdByUser: null,
      updatedByUser: null,
      attachments: [],
      outgoingRelations: [],
      incomingRelations: [],
      blockedFollowUps: [],
    };

    projectServiceMock.listProjectKanbanTasks.mockResolvedValueOnce([
      { ...baseTask, id: "task-empty", referenceNumber: 2, label: null, labelsJson: null },
      {
        ...baseTask,
        id: "task-multi",
        referenceNumber: 3,
        label: "frontend",
        labelsJson: '["frontend","qa"]',
      },
      { ...baseTask, id: "task-legacy", referenceNumber: 4, label: "docs", labelsJson: null },
    ]);

    const response = await GET(
      new Request("http://localhost/api/projects/p1/tasks") as never,
      taskRouteParams("p1")
    );
    const payload = (await response.json()) as {
      tasks: Array<{ id: string; label: string | null; labelsJson: string | null; labels: string[] }>;
    };

    expect(response.status).toBe(200);
    expect(payload.tasks.map((task) => [task.id, task.labels])).toEqual([
      ["task-empty", []],
      ["task-multi", ["frontend", "qa"]],
      ["task-legacy", ["docs"]],
    ]);
    expect(payload.tasks[1]?.label).toBe("frontend");
    expect(payload.tasks[1]?.labelsJson).toBe('["frontend","qa"]');
  });
});

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
      params: Promise.resolve({ projectId: "" }),
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
      data: {
        task: {
          id: "task-created",
          reference: "ND-1",
          title: "New Task",
          label: null,
          labelsJson: null,
          labels: [],
          description: "Description",
          deadlineDate: "2026-04-24",
          commentCount: 0,
          blockedNote: null,
          status: "Backlog",
          position: 0,
          completedAt: null,
          archivedAt: null,
          epic: null,
          assignee: null,
          createdBy: {
            id: "test-user",
            displayName: "reviewer",
            usernameTag: null,
            avatarSeed: "test-user",
          },
          updatedBy: {
            id: "test-user",
            displayName: "reviewer",
            usernameTag: null,
            avatarSeed: "test-user",
          },
          createdAt: "2026-04-24T10:00:00.000Z",
          updatedAt: "2026-04-24T10:00:00.000Z",
          relatedTasks: [],
          blockedFollowUps: [],
          attachments: [],
        },
      },
    });

    const formData = new FormData();
    formData.set("title", "  New Task  ");
    formData.set("description", "  Description  ");
    formData.set("deadlineDate", "2026-04-24");
    formData.set("epicId", "epic-9");
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

    const response = await POST(request as never, taskRouteParams("p1"));

    expect(response.status).toBe(201);
    const payload = await readJson(response);
    expect(payload.taskId).toBe("task-created");
    expect(payload.task).toMatchObject({
      id: "task-created",
      reference: "ND-1",
      title: "New Task",
      labels: [],
      completedAt: null,
      attachments: [],
    });
    expect(projectTaskServiceMock.createTaskForProject).toHaveBeenCalledTimes(1);

    const call = projectTaskServiceMock.createTaskForProject.mock.calls[0][0];
    expect(call.projectId).toBe("p1");
    expect(call.title).toBe("New Task");
    expect(call.description).toBe("Description");
    expect(call.deadlineDate).toBe("2026-04-24");
    expect(call.epicId).toBe("epic-9");
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
      data: {
        task: {
          id: "task-json",
          reference: "ND-2",
          title: "Draft API smoke test",
          label: "agent",
          labelsJson: '["agent","qa"]',
          labels: ["agent", "qa"],
          description: "<p>Validate the agent route.</p>",
          deadlineDate: "2026-04-25",
          commentCount: 0,
          blockedNote: null,
          status: "Backlog",
          position: 0,
          completedAt: null,
          archivedAt: null,
          epic: null,
          assignee: null,
          createdBy: {
            id: "test-user",
            displayName: "reviewer",
            usernameTag: null,
            avatarSeed: "test-user",
          },
          updatedBy: {
            id: "test-user",
            displayName: "reviewer",
            usernameTag: null,
            avatarSeed: "test-user",
          },
          createdAt: "2026-04-25T10:00:00.000Z",
          updatedAt: "2026-04-25T10:00:00.000Z",
          relatedTasks: [],
          blockedFollowUps: [],
          attachments: [],
        },
      },
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
        epicId: "epic-7",
        assigneeUserId: "user-2",
        labels: ["agent", "qa"],
        relatedTaskIds: ["task-a"],
        attachmentLinks: [{ name: "Spec", url: "https://example.com/spec" }],
      }),
    });

    const response = await POST(request as never, taskRouteParams("p1"));

    expect(response.status).toBe(201);
    const payload = await readJson(response);
    expect(payload.taskId).toBe("task-json");
    expect(payload.task).toMatchObject({
      id: "task-json",
      reference: "ND-2",
      labels: ["agent", "qa"],
      completedAt: null,
    });
    expect(projectTaskServiceMock.createTaskForProject).toHaveBeenCalledWith({
      actorUserId: "test-user",
      projectId: "p1",
      title: "Draft API smoke test",
      description: "<p>Validate the agent route.</p>",
      deadlineDate: "2026-04-25",
      epicId: "epic-7",
      assigneeUserId: "user-2",
      labelsJsonRaw: '["agent","qa"]',
      relatedTaskIdsJsonRaw: '["task-a"]',
      attachmentLinksJsonRaw:
        '[{"name":"Spec","url":"https://example.com/spec"}]',
      attachmentFiles: [],
      agentAccess: undefined,
    });
  });

  test("returns a board-ready task payload when the service provides one", async () => {
    projectTaskServiceMock.createTaskForProject.mockResolvedValueOnce({
      ok: true,
      data: {
        task: {
          id: "task-rich",
          title: "Rich payload",
          label: "frontend",
          labelsJson: '["frontend"]',
          description: "<p>Fast path.</p>",
          deadlineDate: "2026-06-01",
          commentCount: 0,
          blockedNote: null,
          status: "Backlog",
          position: 3,
          archivedAt: null,
          epic: null,
          assignee: null,
          createdBy: {
            id: "test-user",
            displayName: "Test User",
            usernameTag: null,
            avatarSeed: "test-user",
          },
          updatedBy: {
            id: "test-user",
            displayName: "Test User",
            usernameTag: null,
            avatarSeed: "test-user",
          },
          createdAt: new Date("2026-05-31T10:00:00.000Z"),
          updatedAt: new Date("2026-05-31T10:00:00.000Z"),
          relatedTasks: [],
          blockedFollowUps: [],
          attachments: [
            {
              id: "att-1",
              kind: "link",
              name: "Spec",
              url: "https://example.com",
              mimeType: null,
              sizeBytes: null,
            },
          ],
        },
      },
    });

    const request = new Request("http://localhost/api/projects/p1/tasks", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Rich payload",
      }),
    });

    const response = await POST(request as never, taskRouteParams("p1"));

    expect(response.status).toBe(201);
    await expect(readJson(response)).resolves.toMatchObject({
      taskId: "task-rich",
      task: {
        id: "task-rich",
        title: "Rich payload",
        position: 3,
        attachments: [
          {
            id: "att-1",
            downloadUrl: null,
          },
        ],
      },
    });
    expect(response.headers.get("Server-Timing")).toMatch(/^task-create;dur=/);
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

    const response = await POST(request as never, taskRouteParams("p1"));

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({
      error: "deadline-invalid",
    });
    expect(projectTaskServiceMock.createTaskForProject).not.toHaveBeenCalled();
  });

  test("returns 400 when json epicId is not a string", async () => {
    const request = new Request("http://localhost/api/projects/p1/tasks", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Draft API smoke test",
        epicId: 123,
      }),
    });

    const response = await POST(request as never, taskRouteParams("p1"));

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({
      error: "epic-invalid",
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

    const response = await POST(request as never, taskRouteParams("p1"));

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

    const response = await POST(request as never, taskRouteParams("p1"));

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

    const response = await POST(request as never, taskRouteParams("p1"));

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

    const response = await POST(request as never, taskRouteParams("p1"));

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({
      error: "Invalid JSON payload",
    });
    expect(projectTaskServiceMock.createTaskForProject).not.toHaveBeenCalled();
  });
});
