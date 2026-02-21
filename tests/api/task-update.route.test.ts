import { beforeEach, describe, expect, test, vi } from "vitest";

const txMock = vi.hoisted(() => ({
  task: {
    update: vi.fn(),
    findUnique: vi.fn(),
  },
  taskBlockedFollowUp: {
    create: vi.fn(),
  },
}));

const prismaMock = vi.hoisted(() => ({
  project: {
    findFirst: vi.fn(),
  },
  task: {
    findUnique: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import { PATCH } from "@/app/api/projects/[projectId]/tasks/[taskId]/route";

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("PATCH /api/projects/:projectId/tasks/:taskId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.project.findFirst.mockResolvedValue({ id: "p1" });
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof txMock) => unknown) =>
      callback(txMock)
    );
  });

  test("returns 400 for invalid json payload", async () => {
    const request = new Request("http://localhost/api/projects/p1/tasks/t1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: "{",
    });

    const response = await PATCH(request as never, {
      params: { projectId: "p1", taskId: "t1" },
    });

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({
      error: "Invalid JSON payload",
    });
  });

  test("returns 400 for too-short title", async () => {
    const request = new Request("http://localhost/api/projects/p1/tasks/t1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "a",
      }),
    });

    const response = await PATCH(request as never, {
      params: { projectId: "p1", taskId: "t1" },
    });

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({
      error: "Task title must be at least 2 characters",
    });
    expect(prismaMock.task.findUnique).not.toHaveBeenCalled();
  });

  test("returns 404 when task is missing or outside project scope", async () => {
    prismaMock.task.findUnique.mockResolvedValueOnce(null);

    const request = new Request("http://localhost/api/projects/p1/tasks/t1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Valid title",
      }),
    });

    const response = await PATCH(request as never, {
      params: { projectId: "p1", taskId: "t1" },
    });

    expect(response.status).toBe(404);
    await expect(readJson(response)).resolves.toEqual({ error: "Task not found" });
  });

  test("updates task and appends blocked follow-up entry when blocked", async () => {
    prismaMock.task.findUnique.mockResolvedValueOnce({
      id: "t1",
      projectId: "p1",
      status: "Blocked",
      position: 0,
    });
    txMock.task.findUnique.mockResolvedValueOnce({
      id: "t1",
      title: "Updated task",
      label: "Critical",
      labelsJson: JSON.stringify(["Critical", "backend"]),
      description: "<p>Hello</p>",
      blockedNote: null,
      status: "Blocked",
      position: 0,
      blockedFollowUps: [],
    });

    const request = new Request("http://localhost/api/projects/p1/tasks/t1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "  Updated task  ",
        labels: ["Critical", " backend ", "critical"],
        description: "<p>Hello<script>alert(1)</script></p>",
        blockedFollowUpEntry: "  Waiting on IAM role  ",
      }),
    });

    const response = await PATCH(request as never, {
      params: { projectId: "p1", taskId: "t1" },
    });

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({
      task: {
        id: "t1",
        title: "Updated task",
        label: "Critical",
        labelsJson: JSON.stringify(["Critical", "backend"]),
        description: "<p>Hello</p>",
        blockedNote: null,
        status: "Blocked",
        position: 0,
        blockedFollowUps: [],
      },
    });

    expect(txMock.task.update).toHaveBeenCalledTimes(1);
    const updatePayload = txMock.task.update.mock.calls[0][0];
    expect(updatePayload.where).toEqual({ id: "t1" });
    expect(updatePayload.data).toMatchObject({
      title: "Updated task",
      label: "Critical",
      labelsJson: JSON.stringify(["Critical", "backend"]),
      description: "<p>Hello</p>",
    });

    expect(txMock.taskBlockedFollowUp.create).toHaveBeenCalledTimes(1);
    expect(txMock.taskBlockedFollowUp.create).toHaveBeenCalledWith({
      data: {
        taskId: "t1",
        content: "Waiting on IAM role",
      },
    });
  });

  test("skips blocked follow-up append when task is not blocked", async () => {
    prismaMock.task.findUnique.mockResolvedValueOnce({
      id: "t1",
      projectId: "p1",
      status: "In Progress",
      position: 2,
    });
    txMock.task.findUnique.mockResolvedValueOnce({
      id: "t1",
      title: "Updated",
      label: null,
      labelsJson: null,
      description: null,
      blockedNote: null,
      status: "In Progress",
      position: 2,
      blockedFollowUps: [],
    });

    const request = new Request("http://localhost/api/projects/p1/tasks/t1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Updated",
        blockedFollowUpEntry: "Should not be persisted",
      }),
    });

    const response = await PATCH(request as never, {
      params: { projectId: "p1", taskId: "t1" },
    });

    expect(response.status).toBe(200);
    expect(txMock.taskBlockedFollowUp.create).not.toHaveBeenCalled();
  });

  test("returns 500 when database operations fail", async () => {
    prismaMock.task.findUnique.mockRejectedValueOnce(new Error("db-failure"));

    const request = new Request("http://localhost/api/projects/p1/tasks/t1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Valid title",
      }),
    });

    const response = await PATCH(request as never, {
      params: { projectId: "p1", taskId: "t1" },
    });

    expect(response.status).toBe(500);
    await expect(readJson(response)).resolves.toEqual({
      error: "Failed to update task",
    });
  });
});
