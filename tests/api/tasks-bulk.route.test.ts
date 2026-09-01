import { beforeEach, describe, expect, test, vi } from "vitest";

const apiGuardMock = vi.hoisted(() => ({
  getAgentProjectAccessContext: vi.fn(),
  requireApiPrincipal: vi.fn(),
}));

const projectAccessServiceMock = vi.hoisted(() => ({
  requireAgentProjectScopes: vi.fn(() => ({ ok: true })),
}));

const projectTaskServiceMock = vi.hoisted(() => ({
  createTaskForProject: vi.fn(),
  updateTaskForProject: vi.fn(),
  moveTaskStatusForProject: vi.fn(),
}));

vi.mock("@/lib/auth/api-guard", () => ({
  getAgentProjectAccessContext: apiGuardMock.getAgentProjectAccessContext,
  requireApiPrincipal: apiGuardMock.requireApiPrincipal,
}));

vi.mock("@/lib/services/project-access-service", () => ({
  requireAgentProjectScopes: projectAccessServiceMock.requireAgentProjectScopes,
}));

vi.mock("@/lib/services/project-attachment-service", () => ({
  mapTaskAttachmentResponse: vi.fn(
    (_projectId: string, _taskId: string, attachment: Record<string, unknown>) =>
      attachment
  ),
}));

vi.mock("@/lib/services/project-task-service", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/services/project-task-service")>();
  return {
    ...original,
    createTaskForProject: projectTaskServiceMock.createTaskForProject,
    updateTaskForProject: projectTaskServiceMock.updateTaskForProject,
    moveTaskStatusForProject: projectTaskServiceMock.moveTaskStatusForProject,
  };
});

import { POST } from "@/app/api/projects/[projectId]/tasks/bulk/route";
import { MAX_BULK_TASK_OPERATIONS } from "@/lib/services/project-task-service";

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

function bulkRouteParams(projectId: string) {
  return { params: Promise.resolve({ projectId }) };
}

function bulkRequest(body: unknown) {
  return new Request("http://localhost/api/projects/p1/tasks/bulk", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function buildTaskPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: "task-1",
    reference: "ND-1",
    title: "Task",
    label: null,
    labelsJson: null,
    description: null,
    deadlineDate: null,
    commentCount: 0,
    blockedNote: null,
    status: "Backlog",
    position: 0,
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
    createdAt: new Date("2026-08-01T08:00:00.000Z"),
    updatedAt: new Date("2026-08-01T08:00:00.000Z"),
    relatedTasks: [],
    blockedFollowUps: [],
    attachments: [],
    ...overrides,
  };
}

describe("POST /api/projects/:projectId/tasks/bulk", () => {
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

  test("returns 400 for invalid json payload", async () => {
    const request = new Request("http://localhost/api/projects/p1/tasks/bulk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });

    const response = await POST(request as never, bulkRouteParams("p1"));

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({
      error: "Invalid JSON payload",
    });
  });

  test("returns 400 for missing, empty, or non-array operations", async () => {
    for (const body of [{}, { operations: [] }, { operations: "nope" }]) {
      const response = await POST(bulkRequest(body) as never, bulkRouteParams("p1"));
      expect(response.status).toBe(400);
      await expect(readJson(response)).resolves.toEqual({ error: "Invalid payload" });
    }
  });

  test("returns 400 when the batch exceeds the operation cap", async () => {
    const operations = Array.from({ length: MAX_BULK_TASK_OPERATIONS + 1 }, () => ({
      type: "create",
      task: { title: "Task" },
    }));

    const response = await POST(
      bulkRequest({ operations }) as never,
      bulkRouteParams("p1")
    );

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({ error: "Invalid payload" });
  });

  test("returns 400 for an unknown operation type", async () => {
    const response = await POST(
      bulkRequest({ operations: [{ type: "delete", taskId: "task-1" }] }) as never,
      bulkRouteParams("p1")
    );

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({ error: "Invalid payload" });
  });

  test("returns 400 for structurally invalid create, update, and status operations", async () => {
    const invalidBodies = [
      { operations: [{ type: "create", task: { description: "no title" } }] },
      { operations: [{ type: "create", task: { title: "" } }] },
      { operations: [{ type: "update", taskId: "task-1" }] },
      { operations: [{ type: "update", taskId: "", changes: {} }] },
      { operations: [{ type: "status", taskId: "task-1", status: "Unknown" }] },
      { operations: [{ type: "status", status: "Done" }] },
      { operations: [{ type: "status", taskId: "task-1", status: "Done", position: -1 }] },
    ];

    for (const body of invalidBodies) {
      const response = await POST(bulkRequest(body) as never, bulkRouteParams("p1"));
      expect(response.status).toBe(400);
      await expect(readJson(response)).resolves.toEqual({ error: "Invalid payload" });
    }

    expect(projectTaskServiceMock.createTaskForProject).not.toHaveBeenCalled();
    expect(projectTaskServiceMock.updateTaskForProject).not.toHaveBeenCalled();
    expect(projectTaskServiceMock.moveTaskStatusForProject).not.toHaveBeenCalled();
  });

  test("returns 403 when the agent lacks the task write scope", async () => {
    projectAccessServiceMock.requireAgentProjectScopes.mockReturnValueOnce({
      ok: false,
      status: 403,
      error: "forbidden",
    });

    const response = await POST(
      bulkRequest({
        operations: [{ type: "create", task: { title: "Task" } }],
      }) as never,
      bulkRouteParams("p1")
    );

    expect(response.status).toBe(403);
    await expect(readJson(response)).resolves.toEqual({ error: "forbidden" });
  });

  test("reports per-operation failures without failing sibling operations", async () => {
    projectTaskServiceMock.updateTaskForProject.mockResolvedValueOnce({
      ok: true,
      data: { task: buildTaskPayload({ id: "task-a" }) },
    });
    projectTaskServiceMock.updateTaskForProject.mockResolvedValueOnce({
      ok: false,
      status: 404,
      error: "Task not found",
    });
    projectTaskServiceMock.updateTaskForProject.mockResolvedValueOnce({
      ok: true,
      data: { task: buildTaskPayload({ id: "task-c" }) },
    });

    const response = await POST(
      bulkRequest({
        operations: [
          { type: "update", taskId: "task-a", changes: { title: "A" } },
          { type: "update", taskId: "task-b", changes: { title: "B" } },
          { type: "update", taskId: "task-c", changes: { title: "C" } },
        ],
      }) as never,
      bulkRouteParams("p1")
    );

    expect(response.status).toBe(200);
    const payload = (await readJson(response)) as {
      results: Array<{ index: number; ok: boolean; status: number; taskId?: string; error?: string }>;
    };

    expect(
      payload.results.map(({ index, ok, status, taskId, error }) => ({
        index,
        ok,
        status,
        taskId,
        error,
      }))
    ).toEqual([
      { index: 0, ok: true, status: 200, taskId: "task-a", error: undefined },
      { index: 1, ok: false, status: 404, taskId: undefined, error: "Task not found" },
      { index: 2, ok: true, status: 200, taskId: "task-c", error: undefined },
    ]);
    expect(projectTaskServiceMock.updateTaskForProject).toHaveBeenCalledTimes(3);
  });

  test("executes create operations with mapped fields and 201 results", async () => {
    projectTaskServiceMock.createTaskForProject.mockResolvedValueOnce({
      ok: true,
      data: { task: buildTaskPayload({ id: "task-new", title: "Created task" }) },
    });

    const response = await POST(
      bulkRequest({
        operations: [
          {
            type: "create",
            task: {
              title: "  Created task  ",
              description: "  Description  ",
              deadlineDate: "2026-09-01",
              labels: ["backend", "qa"],
              relatedTaskIds: ["task-x"],
            },
          },
        ],
      }) as never,
      bulkRouteParams("p1")
    );

    expect(response.status).toBe(200);
    const payload = (await readJson(response)) as {
      results: Array<{ ok: boolean; status: number; taskId?: string; task?: Record<string, unknown> }>;
    };

    expect(payload.results[0]).toMatchObject({
      index: 0,
      ok: true,
      status: 201,
      taskId: "task-new",
    });
    expect(payload.results[0].task).toMatchObject({ id: "task-new", title: "Created task" });

    const createCall = projectTaskServiceMock.createTaskForProject.mock.calls[0][0];
    expect(createCall).toMatchObject({
      actorUserId: "test-user",
      projectId: "p1",
      title: "Created task",
      description: "Description",
      deadlineDate: "2026-09-01",
      labelsJsonRaw: '["backend","qa"]',
      relatedTaskIdsJsonRaw: '["task-x"]',
      attachmentFiles: [],
      agentAccess: undefined,
    });
  });

  test("rejects invalid create field types without blocking valid siblings", async () => {
    projectTaskServiceMock.createTaskForProject.mockResolvedValueOnce({
      ok: true,
      data: { task: buildTaskPayload({ id: "task-new" }) },
    });
    projectTaskServiceMock.updateTaskForProject.mockResolvedValueOnce({
      ok: true,
      data: { task: buildTaskPayload({ id: "task-a" }) },
    });

    const response = await POST(
      bulkRequest({
        operations: [
          { type: "create", task: { title: "Valid create" } },
          { type: "create", task: { title: "Broken create", deadlineDate: 20260901 } },
          { type: "update", taskId: "task-a", changes: { title: "A" } },
        ],
      }) as never,
      bulkRouteParams("p1")
    );

    expect(response.status).toBe(200);
    const payload = (await readJson(response)) as {
      results: Array<{ index: number; ok: boolean; status: number; taskId?: string; error?: string }>;
    };

    expect(
      payload.results.map(({ index, ok, status, taskId, error }) => ({
        index,
        ok,
        status,
        taskId,
        error,
      }))
    ).toEqual([
      { index: 0, ok: true, status: 201, taskId: "task-new", error: undefined },
      { index: 1, ok: false, status: 400, taskId: undefined, error: "deadline-invalid" },
      { index: 2, ok: true, status: 200, taskId: "task-a", error: undefined },
    ]);
    expect(projectTaskServiceMock.createTaskForProject).toHaveBeenCalledTimes(1);
    expect(projectTaskServiceMock.updateTaskForProject).toHaveBeenCalledTimes(1);
  });

  test("delegates update and status operations to the single-item services", async () => {
    projectTaskServiceMock.updateTaskForProject.mockResolvedValueOnce({
      ok: true,
      data: { task: buildTaskPayload({ id: "task-a", status: "In Progress" }) },
    });
    projectTaskServiceMock.moveTaskStatusForProject.mockResolvedValueOnce({
      ok: true,
      data: { task: buildTaskPayload({ id: "task-b", status: "Done", position: 2 }) },
    });

    const response = await POST(
      bulkRequest({
        operations: [
          { type: "update", taskId: "task-a", changes: { assigneeUserId: null } },
          { type: "status", taskId: "task-b", status: "Done", position: 2 },
        ],
      }) as never,
      bulkRouteParams("p1")
    );

    expect(response.status).toBe(200);
    const payload = (await readJson(response)) as {
      results: Array<{ ok: boolean; status: number; taskId?: string }>;
    };
    expect(
      payload.results.map(({ ok, status, taskId }) => ({ ok, status, taskId }))
    ).toEqual([
      { ok: true, status: 200, taskId: "task-a" },
      { ok: true, status: 200, taskId: "task-b" },
    ]);

    expect(projectTaskServiceMock.updateTaskForProject).toHaveBeenCalledWith(
      "p1",
      "task-a",
      { assigneeUserId: null },
      "test-user",
      undefined
    );
    expect(projectTaskServiceMock.moveTaskStatusForProject).toHaveBeenCalledWith(
      "p1",
      "task-b",
      { status: "Done", position: 2 },
      "test-user",
      undefined
    );
  });

  test("runs operations sequentially in request order", async () => {
    projectTaskServiceMock.updateTaskForProject.mockResolvedValue({
      ok: true,
      data: { task: buildTaskPayload({ id: "task-a" }) },
    });

    await POST(
      bulkRequest({
        operations: [
          { type: "update", taskId: "task-a", changes: { title: "First" } },
          { type: "update", taskId: "task-b", changes: { title: "Second" } },
        ],
      }) as never,
      bulkRouteParams("p1")
    );

    expect(projectTaskServiceMock.updateTaskForProject.mock.calls[0][0]).toBe("p1");
    expect(projectTaskServiceMock.updateTaskForProject.mock.calls[0][1]).toBe("task-a");
    expect(projectTaskServiceMock.updateTaskForProject.mock.calls[1][1]).toBe("task-b");
    expect(projectTaskServiceMock.updateTaskForProject.mock.invocationCallOrder[0]).toBeLessThan(
      projectTaskServiceMock.updateTaskForProject.mock.invocationCallOrder[1]
    );
  });

  test("returns the results payload with a Server-Timing header", async () => {
    projectTaskServiceMock.updateTaskForProject.mockResolvedValueOnce({
      ok: true,
      data: { task: buildTaskPayload({ id: "task-a" }) },
    });

    const response = await POST(
      bulkRequest({
        operations: [{ type: "update", taskId: "task-a", changes: { title: "A" } }],
      }) as never,
      bulkRouteParams("p1")
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Server-Timing")).toMatch(/^task-bulk;dur=/);
  });
});
