import { beforeEach, describe, expect, test, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  project: {
    findFirst: vi.fn(),
  },
  task: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import { POST } from "@/app/api/projects/[projectId]/tasks/[taskId]/status/route";

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

function statusRouteParams(projectId: string, taskId: string) {
  return { params: Promise.resolve({ projectId, taskId }) };
}

function statusRequest(body: unknown) {
  return new Request("http://localhost/api/projects/p1/tasks/t1/status", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const personSummary = {
  id: "user-1",
  name: "Alice Example",
  email: "alice@example.com",
  username: "alice",
  usernameDiscriminator: "1234",
  avatarSeed: null,
};

function buildPayloadTask(overrides: Record<string, unknown> = {}) {
  return {
    id: "t1",
    referenceNumber: 42,
    title: "Task A",
    label: null,
    labelsJson: null,
    description: null,
    deadlineAt: null,
    _count: { comments: 0 },
    blockedNote: null,
    status: "Done",
    position: 0,
    archivedAt: null,
    createdAt: new Date("2026-08-01T08:00:00.000Z"),
    updatedAt: new Date("2026-08-01T08:00:00.000Z"),
    attachments: [],
    epic: null,
    createdByUser: personSummary,
    updatedByUser: personSummary,
    assigneeUser: null,
    outgoingRelations: [],
    incomingRelations: [],
    blockedFollowUps: [],
    ...overrides,
  };
}

function mockExistingTask(overrides: Record<string, unknown> = {}) {
  prismaMock.task.findUnique.mockResolvedValueOnce({
    id: "t1",
    projectId: "p1",
    status: "Backlog",
    position: 1,
    archivedAt: null,
    completedAt: null,
    ...overrides,
  });
}

describe("POST /api/projects/:projectId/tasks/:taskId/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.project.findFirst.mockResolvedValue({
      ownerId: "test-user",
      memberships: [],
    });
    prismaMock.task.update.mockResolvedValue({});
    prismaMock.task.updateMany.mockResolvedValue({ count: 0 });
  });

  test("returns 400 for invalid json payload", async () => {
    const request = new Request("http://localhost/api/projects/p1/tasks/t1/status", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });

    const response = await POST(request as never, statusRouteParams("p1", "t1"));

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({
      error: "Invalid JSON payload",
    });
  });

  test("returns 400 for an unknown status", async () => {
    const response = await POST(
      statusRequest({ status: "Unknown" }) as never,
      statusRouteParams("p1", "t1")
    );

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({ error: "Invalid payload" });
  });

  test("returns 400 for a negative or non-integer position", async () => {
    for (const position of [-1, 1.5, "1", true]) {
      const response = await POST(
        statusRequest({ status: "Done", position }) as never,
        statusRouteParams("p1", "t1")
      );

      expect(response.status).toBe(400);
      await expect(readJson(response)).resolves.toEqual({ error: "Invalid payload" });
    }
  });

  test("returns 404 when the task does not belong to the project", async () => {
    mockExistingTask({ projectId: "other-project" });

    const response = await POST(
      statusRequest({ status: "Done" }) as never,
      statusRouteParams("p1", "t1")
    );

    expect(response.status).toBe(404);
    await expect(readJson(response)).resolves.toEqual({ error: "Task not found" });
  });

  test("appends to an empty destination column without shifting", async () => {
    mockExistingTask();
    prismaMock.task.findMany.mockResolvedValueOnce([]);
    prismaMock.task.findUnique.mockResolvedValueOnce(buildPayloadTask({ status: "Done" }));

    const response = await POST(
      statusRequest({ status: "Done" }) as never,
      statusRouteParams("p1", "t1")
    );

    expect(response.status).toBe(200);
    const payload = await readJson(response);
    expect(payload.task).toMatchObject({ id: "t1", status: "Done" });

    expect(prismaMock.task.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.task.update).toHaveBeenCalledTimes(1);
    const movedUpdate = prismaMock.task.update.mock.calls[0][0];
    expect(movedUpdate.where).toEqual({ id: "t1" });
    expect(movedUpdate.data).toMatchObject({
      status: "Done",
      position: 0,
      archivedAt: null,
      updatedByUserId: "test-user",
    });
  });

  test("appends to a populated destination column at the end", async () => {
    mockExistingTask();
    prismaMock.task.findMany.mockResolvedValueOnce([
      { id: "task-a", position: 0 },
      { id: "task-b", position: 1 },
    ]);
    prismaMock.task.findUnique.mockResolvedValueOnce(buildPayloadTask());

    const response = await POST(
      statusRequest({ status: "Done" }) as never,
      statusRouteParams("p1", "t1")
    );

    expect(response.status).toBe(200);
    expect(prismaMock.task.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.task.update.mock.calls[0][0].data.position).toBe(2);
  });

  test("inserts at a requested position and shifts later destination tasks", async () => {
    mockExistingTask();
    prismaMock.task.findMany.mockResolvedValueOnce([
      { id: "task-a", position: 0 },
      { id: "task-b", position: 1 },
      { id: "task-c", position: 2 },
    ]);
    prismaMock.task.findUnique.mockResolvedValueOnce(buildPayloadTask({ position: 1 }));

    const response = await POST(
      statusRequest({ status: "Done", position: 1 }) as never,
      statusRouteParams("p1", "t1")
    );

    expect(response.status).toBe(200);
    expect(prismaMock.task.updateMany).toHaveBeenCalledWith({
      where: {
        projectId: "p1",
        status: "Done",
        position: { gte: 1 },
      },
      data: { position: { increment: 1 } },
    });
    const movedUpdate = prismaMock.task.update.mock.calls[0][0];
    expect(movedUpdate.data.status).toBe("Done");
    expect(movedUpdate.data.position).toBe(1);
  });

  test("clamps an out-of-range position to the end of the destination column", async () => {
    mockExistingTask();
    prismaMock.task.findMany.mockResolvedValueOnce([
      { id: "task-a", position: 0 },
      { id: "task-b", position: 1 },
    ]);
    prismaMock.task.findUnique.mockResolvedValueOnce(buildPayloadTask({ position: 2 }));

    const response = await POST(
      statusRequest({ status: "Done", position: 99 }) as never,
      statusRouteParams("p1", "t1")
    );

    expect(response.status).toBe(200);
    expect(prismaMock.task.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.task.update.mock.calls[0][0].data.position).toBe(2);
  });

  test("shifts same-column tasks down when moving the task earlier", async () => {
    mockExistingTask({ status: "Backlog", position: 2 });
    prismaMock.task.findMany.mockResolvedValueOnce([
      { id: "task-0", position: 0 },
      { id: "task-1", position: 1 },
      { id: "task-3", position: 3 },
    ]);
    prismaMock.task.findUnique.mockResolvedValueOnce(
      buildPayloadTask({ status: "Backlog", position: 0 })
    );

    const response = await POST(
      statusRequest({ status: "Backlog", position: 0 }) as never,
      statusRouteParams("p1", "t1")
    );

    expect(response.status).toBe(200);
    expect(prismaMock.task.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.task.update).toHaveBeenCalledTimes(3);

    const shifted = prismaMock.task.update.mock.calls.slice(0, 2).map((call) => ({
      where: call[0].where,
      position: call[0].data.position,
    }));
    expect(shifted).toEqual([
      { where: { id: "task-0" }, position: 1 },
      { where: { id: "task-1" }, position: 2 },
    ]);

    const movedUpdate = prismaMock.task.update.mock.calls[2][0];
    expect(movedUpdate.where).toEqual({ id: "t1" });
    expect(movedUpdate.data.position).toBe(0);
    expect(movedUpdate.data.status).toBe("Backlog");
  });

  test("shifts same-column tasks up when moving the task later", async () => {
    mockExistingTask({ status: "Backlog", position: 0 });
    prismaMock.task.findMany.mockResolvedValueOnce([
      { id: "task-1", position: 1 },
      { id: "task-2", position: 2 },
    ]);
    prismaMock.task.findUnique.mockResolvedValueOnce(
      buildPayloadTask({ status: "Backlog", position: 2 })
    );

    const response = await POST(
      statusRequest({ status: "Backlog", position: 2 }) as never,
      statusRouteParams("p1", "t1")
    );

    expect(response.status).toBe(200);
    expect(prismaMock.task.updateMany).not.toHaveBeenCalled();

    const shifted = prismaMock.task.update.mock.calls.slice(0, 2).map((call) => ({
      where: call[0].where,
      position: call[0].data.position,
    }));
    expect(shifted).toEqual([
      { where: { id: "task-2" }, position: 1 },
      { where: { id: "task-1" }, position: 0 },
    ]);

    expect(prismaMock.task.update.mock.calls[2][0].data.position).toBe(2);
  });

  test("sets completedAt when moving into Done", async () => {
    mockExistingTask();
    prismaMock.task.findMany.mockResolvedValueOnce([]);
    prismaMock.task.findUnique.mockResolvedValueOnce(buildPayloadTask());

    const response = await POST(
      statusRequest({ status: "Done" }) as never,
      statusRouteParams("p1", "t1")
    );

    expect(response.status).toBe(200);
    expect(prismaMock.task.update.mock.calls[0][0].data.completedAt).toBeInstanceOf(Date);
  });

  test("preserves completedAt when moving within Done", async () => {
    const existingDoneDate = new Date("2026-02-01T12:00:00.000Z");
    mockExistingTask({ status: "Done", completedAt: existingDoneDate });
    prismaMock.task.findMany.mockResolvedValueOnce([]);
    prismaMock.task.findUnique.mockResolvedValueOnce(buildPayloadTask());

    const response = await POST(
      statusRequest({ status: "Done" }) as never,
      statusRouteParams("p1", "t1")
    );

    expect(response.status).toBe(200);
    expect(prismaMock.task.update.mock.calls[0][0].data.completedAt).toBe(existingDoneDate);
  });

  test("clears completedAt when moving out of Done", async () => {
    const existingDoneDate = new Date("2026-02-01T12:00:00.000Z");
    mockExistingTask({ status: "Done", completedAt: existingDoneDate });
    prismaMock.task.findMany.mockResolvedValueOnce([]);
    prismaMock.task.findUnique.mockResolvedValueOnce(buildPayloadTask({ status: "Backlog" }));

    const response = await POST(
      statusRequest({ status: "Backlog" }) as never,
      statusRouteParams("p1", "t1")
    );

    expect(response.status).toBe(200);
    expect(prismaMock.task.update.mock.calls[0][0].data.completedAt).toBeNull();
  });

  test("unarchives an archived task when moving it", async () => {
    mockExistingTask({ archivedAt: new Date("2026-02-01T12:00:00.000Z") });
    prismaMock.task.findMany.mockResolvedValueOnce([]);
    prismaMock.task.findUnique.mockResolvedValueOnce(buildPayloadTask());

    const response = await POST(
      statusRequest({ status: "Done" }) as never,
      statusRouteParams("p1", "t1")
    );

    expect(response.status).toBe(200);
    expect(prismaMock.task.update.mock.calls[0][0].data.archivedAt).toBeNull();
  });

  test("returns the current task without writes when nothing changes", async () => {
    mockExistingTask({ status: "Backlog", position: 1 });
    prismaMock.task.findMany.mockResolvedValueOnce([
      { id: "task-0", position: 0 },
    ]);
    prismaMock.task.findUnique.mockResolvedValueOnce(buildPayloadTask({ status: "Backlog" }));

    const response = await POST(
      statusRequest({ status: "Backlog" }) as never,
      statusRouteParams("p1", "t1")
    );

    expect(response.status).toBe(200);
    const payload = await readJson(response);
    expect(payload.task).toMatchObject({ id: "t1", status: "Backlog" });
    expect(prismaMock.task.update).not.toHaveBeenCalled();
    expect(prismaMock.task.updateMany).not.toHaveBeenCalled();
  });

  test("returns the full task payload with Server-Timing header", async () => {
    mockExistingTask();
    prismaMock.task.findMany.mockResolvedValueOnce([]);
    prismaMock.task.findUnique.mockResolvedValueOnce(
      buildPayloadTask({ status: "Done", referenceNumber: 42 })
    );

    const response = await POST(
      statusRequest({ status: "Done" }) as never,
      statusRouteParams("p1", "t1")
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Server-Timing")).toMatch(/^task-status;dur=/);
    const payload = await readJson(response);
    expect(payload.task).toMatchObject({
      id: "t1",
      reference: "ND-42",
      status: "Done",
      position: 0,
    });
  });

  test("returns 500 when persistence fails", async () => {
    mockExistingTask();
    prismaMock.task.findMany.mockResolvedValueOnce([]);
    prismaMock.task.update.mockRejectedValueOnce(new Error("db-failure"));

    const response = await POST(
      statusRequest({ status: "Done" }) as never,
      statusRouteParams("p1", "t1")
    );

    expect(response.status).toBe(500);
    await expect(readJson(response)).resolves.toEqual({ error: "Failed to move task" });
  });
});
