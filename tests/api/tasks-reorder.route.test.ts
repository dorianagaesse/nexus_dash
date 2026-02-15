import { beforeEach, describe, expect, test, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  task: {
    findMany: vi.fn(),
    update: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import { POST } from "@/app/api/projects/[projectId]/tasks/reorder/route";

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("POST /api/projects/:projectId/tasks/reorder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns 400 for invalid json payload", async () => {
    const request = new Request("http://localhost/api/projects/p1/tasks/reorder", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });

    const response = await POST(request as never, {
      params: { projectId: "p1" },
    });

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({
      error: "Invalid JSON payload",
    });
  });

  test("returns 400 for invalid payload shape", async () => {
    const request = new Request("http://localhost/api/projects/p1/tasks/reorder", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        columns: [{ status: "Unknown", taskIds: ["task-1"] }],
      }),
    });

    const response = await POST(request as never, {
      params: { projectId: "p1" },
    });

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({ error: "Invalid payload" });
  });

  test("returns 400 for duplicate task ids across columns", async () => {
    const request = new Request("http://localhost/api/projects/p1/tasks/reorder", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        columns: [
          { status: "Backlog", taskIds: ["task-1"] },
          { status: "In Progress", taskIds: ["task-1"] },
        ],
      }),
    });

    const response = await POST(request as never, {
      params: { projectId: "p1" },
    });

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({ error: "Invalid payload" });
    expect(prismaMock.task.findMany).not.toHaveBeenCalled();
  });

  test("returns ok without db writes when all columns are empty", async () => {
    const request = new Request("http://localhost/api/projects/p1/tasks/reorder", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        columns: [],
      }),
    });

    const response = await POST(request as never, {
      params: { projectId: "p1" },
    });

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({ ok: true });
    expect(prismaMock.task.findMany).not.toHaveBeenCalled();
    expect(prismaMock.task.update).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  test("returns 400 when tasks do not belong to the project", async () => {
    prismaMock.task.findMany.mockResolvedValueOnce([
      { id: "task-1", status: "Backlog", completedAt: null },
    ]);

    const request = new Request("http://localhost/api/projects/p1/tasks/reorder", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        columns: [{ status: "Backlog", taskIds: ["task-1", "task-2"] }],
      }),
    });

    const response = await POST(request as never, {
      params: { projectId: "p1" },
    });

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({
      error: "One or more tasks do not belong to this project",
    });
  });

  test("updates positions/status and preserves done completion date", async () => {
    const existingDoneDate = new Date("2026-02-01T12:00:00.000Z");

    prismaMock.task.findMany.mockResolvedValueOnce([
      { id: "task-moved", status: "In Progress", completedAt: null },
      { id: "task-done", status: "Done", completedAt: existingDoneDate },
    ]);
    prismaMock.task.update.mockResolvedValue({});
    prismaMock.$transaction.mockResolvedValue([]);

    const request = new Request("http://localhost/api/projects/p1/tasks/reorder", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        columns: [
          {
            status: "Done",
            taskIds: ["task-moved", "task-done"],
          },
        ],
      }),
    });

    const response = await POST(request as never, {
      params: { projectId: "p1" },
    });

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({ ok: true });

    expect(prismaMock.task.update).toHaveBeenCalledTimes(2);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);

    const firstUpdate = prismaMock.task.update.mock.calls[0][0];
    expect(firstUpdate.where).toEqual({ id: "task-moved" });
    expect(firstUpdate.data.status).toBe("Done");
    expect(firstUpdate.data.position).toBe(0);
    expect(firstUpdate.data.archivedAt).toBeNull();
    expect(firstUpdate.data.completedAt).toBeInstanceOf(Date);

    const secondUpdate = prismaMock.task.update.mock.calls[1][0];
    expect(secondUpdate.where).toEqual({ id: "task-done" });
    expect(secondUpdate.data.status).toBe("Done");
    expect(secondUpdate.data.position).toBe(1);
    expect(secondUpdate.data.archivedAt).toBeNull();
    expect(secondUpdate.data.completedAt).toBe(existingDoneDate);
  });

  test("returns 500 when transaction persistence fails", async () => {
    prismaMock.task.findMany.mockResolvedValueOnce([
      { id: "task-1", status: "Backlog", completedAt: null },
    ]);
    prismaMock.task.update.mockResolvedValue({});
    prismaMock.$transaction.mockRejectedValueOnce(new Error("db-failure"));

    const request = new Request("http://localhost/api/projects/p1/tasks/reorder", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        columns: [{ status: "Backlog", taskIds: ["task-1"] }],
      }),
    });

    const response = await POST(request as never, {
      params: { projectId: "p1" },
    });

    expect(response.status).toBe(500);
    await expect(readJson(response)).resolves.toEqual({
      error: "Failed to persist task order",
    });
  });
});
