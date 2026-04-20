import { beforeEach, describe, expect, test, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  project: {
    findFirst: vi.fn(),
  },
  task: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  taskRelation: {
    deleteMany: vi.fn(),
    createMany: vi.fn(),
  },
  taskBlockedFollowUp: {
    create: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

const attachmentStorageMock = vi.hoisted(() => ({
  deleteAttachmentFile: vi.fn(),
}));

vi.mock("@/lib/attachment-storage", () => ({
  deleteAttachmentFile: attachmentStorageMock.deleteAttachmentFile,
}));

import { DELETE, PATCH } from "@/app/api/projects/[projectId]/tasks/[taskId]/route";
import {
  DELETE as unarchiveTask,
  POST as archiveTask,
} from "@/app/api/projects/[projectId]/tasks/[taskId]/archive/route";

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("PATCH /api/projects/:projectId/tasks/:taskId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.project.findFirst.mockResolvedValue({
      ownerId: "test-user",
      memberships: [],
    });
    prismaMock.task.findMany.mockResolvedValue([]);
    prismaMock.taskRelation.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.taskRelation.createMany.mockResolvedValue({ count: 0 });
    attachmentStorageMock.deleteAttachmentFile.mockResolvedValue(undefined);
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

  test("returns 400 for invalid deadline value", async () => {
    const request = new Request("http://localhost/api/projects/p1/tasks/t1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Valid title",
        deadlineDate: "2026-02-30",
      }),
    });

    const response = await PATCH(request as never, {
      params: { projectId: "p1", taskId: "t1" },
    });

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({
      error: "deadline-invalid",
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
    prismaMock.task.findMany.mockResolvedValueOnce([{ id: "t2" }]);
    prismaMock.task.findUnique.mockResolvedValueOnce({
      id: "t1",
      projectId: "p1",
      status: "Blocked",
      position: 0,
      archivedAt: null,
      outgoingRelations: [],
      incomingRelations: [],
    });
    prismaMock.task.findUnique.mockResolvedValueOnce({
      id: "t1",
      title: "Updated task",
      label: "Critical",
      labelsJson: JSON.stringify(["Critical", "backend"]),
      description: "<p>Hello</p>",
      deadlineAt: new Date("2026-04-24T00:00:00.000Z"),
      _count: {
        comments: 1,
      },
      blockedNote: null,
      status: "Blocked",
      position: 0,
      archivedAt: null,
      outgoingRelations: [
        {
          rightTask: {
            id: "t2",
            title: "Sibling task",
            status: "Backlog",
            archivedAt: null,
          },
        },
      ],
      incomingRelations: [],
      blockedFollowUps: [],
    });

    const request = new Request("http://localhost/api/projects/p1/tasks/t1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "  Updated task  ",
        labels: ["Critical", " backend ", "critical"],
        description: "<p>Hello<script>alert(1)</script></p>",
        deadlineDate: "2026-04-24",
        blockedFollowUpEntry: "  Waiting on IAM role  ",
        relatedTaskIds: ["t2"],
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
        deadlineDate: "2026-04-24",
        commentCount: 1,
        blockedNote: null,
        status: "Blocked",
        position: 0,
        archivedAt: null,
        relatedTasks: [
          {
            id: "t2",
            title: "Sibling task",
            status: "Backlog",
            archivedAt: null,
          },
        ],
        blockedFollowUps: [],
      },
    });

    expect(prismaMock.task.update).toHaveBeenCalledTimes(1);
    const updatePayload = prismaMock.task.update.mock.calls[0][0];
    expect(updatePayload.where).toEqual({ id: "t1" });
    expect(updatePayload.data).toMatchObject({
      title: "Updated task",
      label: "Critical",
      labelsJson: JSON.stringify(["Critical", "backend"]),
      description: "<p>Hello</p>",
      deadlineAt: new Date("2026-04-24T00:00:00.000Z"),
    });

    expect(prismaMock.taskBlockedFollowUp.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.taskBlockedFollowUp.create).toHaveBeenCalledWith({
      data: {
        taskId: "t1",
        content: "Waiting on IAM role",
      },
    });
    expect(prismaMock.taskRelation.deleteMany).toHaveBeenCalledWith({
      where: {
        projectId: "p1",
        OR: [{ leftTaskId: "t1" }, { rightTaskId: "t1" }],
      },
    });
    expect(prismaMock.taskRelation.createMany).toHaveBeenCalledWith({
      data: [
        {
          leftTaskId: "t1",
          rightTaskId: "t2",
          projectId: "p1",
        },
      ],
      skipDuplicates: true,
    });
  });

  test("skips blocked follow-up append when task is not blocked", async () => {
    prismaMock.task.findUnique.mockResolvedValueOnce({
      id: "t1",
      projectId: "p1",
      status: "In Progress",
      position: 2,
      archivedAt: null,
      outgoingRelations: [],
      incomingRelations: [],
    });
    prismaMock.task.findUnique.mockResolvedValueOnce({
      id: "t1",
      title: "Updated",
      label: null,
      labelsJson: null,
      description: null,
      deadlineAt: null,
      _count: {
        comments: 0,
      },
      blockedNote: null,
      status: "In Progress",
      position: 2,
      archivedAt: null,
      outgoingRelations: [],
      incomingRelations: [],
      blockedFollowUps: [],
    });

    const request = new Request("http://localhost/api/projects/p1/tasks/t1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Updated",
        blockedFollowUpEntry: "Should not be persisted",
        relatedTaskIds: [],
      }),
    });

    const response = await PATCH(request as never, {
      params: { projectId: "p1", taskId: "t1" },
    });

    expect(response.status).toBe(200);
    expect(prismaMock.taskBlockedFollowUp.create).not.toHaveBeenCalled();
  });

  test("returns 400 when related tasks are invalid", async () => {
    prismaMock.task.findUnique.mockResolvedValueOnce({
      id: "t1",
      projectId: "p1",
      status: "In Progress",
      position: 2,
      archivedAt: null,
      outgoingRelations: [
        {
          rightTaskId: "archived-task",
        },
      ],
      incomingRelations: [],
    });
    prismaMock.task.findMany.mockResolvedValueOnce([]);

    const request = new Request("http://localhost/api/projects/p1/tasks/t1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Updated",
        relatedTaskIds: ["other-project-task"],
      }),
    });

    const response = await PATCH(request as never, {
      params: { projectId: "p1", taskId: "t1" },
    });

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({
      error: "related-tasks-invalid",
    });
    expect(prismaMock.taskRelation.deleteMany).not.toHaveBeenCalled();
  });

  test("allows keeping an already-related archived task during updates", async () => {
    prismaMock.task.findUnique.mockResolvedValueOnce({
      id: "t1",
      projectId: "p1",
      status: "In Progress",
      position: 2,
      archivedAt: null,
      outgoingRelations: [
        {
          rightTaskId: "archived-task",
        },
      ],
      incomingRelations: [],
    });
    prismaMock.task.findMany.mockResolvedValueOnce([{ id: "archived-task" }]);
    prismaMock.task.findUnique.mockResolvedValueOnce({
      id: "t1",
      title: "Updated",
      label: null,
      labelsJson: null,
      description: null,
      deadlineAt: new Date("2026-04-18T00:00:00.000Z"),
      _count: {
        comments: 2,
      },
      blockedNote: null,
      status: "In Progress",
      position: 2,
      archivedAt: null,
      outgoingRelations: [
        {
          rightTask: {
            id: "archived-task",
            title: "Archived sibling",
            status: "Done",
            archivedAt: new Date("2026-03-10T22:00:00.000Z"),
          },
        },
      ],
      incomingRelations: [],
      blockedFollowUps: [],
    });

    const request = new Request("http://localhost/api/projects/p1/tasks/t1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Updated",
        relatedTaskIds: ["archived-task"],
      }),
    });

    const response = await PATCH(request as never, {
      params: { projectId: "p1", taskId: "t1" },
    });

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({
      task: {
        id: "t1",
        title: "Updated",
        label: null,
        labelsJson: null,
        description: null,
        deadlineDate: "2026-04-18",
        commentCount: 2,
        blockedNote: null,
        status: "In Progress",
        position: 2,
        archivedAt: null,
        relatedTasks: [
          {
            id: "archived-task",
            title: "Archived sibling",
            status: "Done",
            archivedAt: "2026-03-10T22:00:00.000Z",
          },
        ],
        blockedFollowUps: [],
      },
    });
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

describe("DELETE /api/projects/:projectId/tasks/:taskId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.project.findFirst.mockResolvedValue({
      ownerId: "test-user",
      memberships: [],
    });
    attachmentStorageMock.deleteAttachmentFile.mockResolvedValue(undefined);
  });

  test("returns 404 when task is missing or outside project scope", async () => {
    prismaMock.task.findUnique.mockResolvedValueOnce(null);

    const request = new Request("http://localhost/api/projects/p1/tasks/t1", {
      method: "DELETE",
    });

    const response = await DELETE(request as never, {
      params: { projectId: "p1", taskId: "t1" },
    });

    expect(response.status).toBe(404);
    await expect(readJson(response)).resolves.toEqual({ error: "Task not found" });
    expect(prismaMock.task.delete).not.toHaveBeenCalled();
  });

  test("deletes task and cleans up file attachments", async () => {
    prismaMock.task.findUnique.mockResolvedValueOnce({
      id: "t1",
      projectId: "p1",
      attachments: [{ storageKey: "task/t1/test-a.pdf" }, { storageKey: "task/t1/test-b.png" }],
    });

    const request = new Request("http://localhost/api/projects/p1/tasks/t1", {
      method: "DELETE",
    });

    const response = await DELETE(request as never, {
      params: { projectId: "p1", taskId: "t1" },
    });

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({ ok: true });
    expect(prismaMock.task.delete).toHaveBeenCalledWith({
      where: { id: "t1" },
    });
    expect(attachmentStorageMock.deleteAttachmentFile).toHaveBeenCalledTimes(2);
    expect(attachmentStorageMock.deleteAttachmentFile).toHaveBeenNthCalledWith(
      1,
      "task/t1/test-a.pdf"
    );
    expect(attachmentStorageMock.deleteAttachmentFile).toHaveBeenNthCalledWith(
      2,
      "task/t1/test-b.png"
    );
  });

  test("returns 500 when delete fails", async () => {
    prismaMock.task.findUnique.mockRejectedValueOnce(new Error("db-failure"));

    const request = new Request("http://localhost/api/projects/p1/tasks/t1", {
      method: "DELETE",
    });

    const response = await DELETE(request as never, {
      params: { projectId: "p1", taskId: "t1" },
    });

    expect(response.status).toBe(500);
    await expect(readJson(response)).resolves.toEqual({
      error: "Failed to delete task",
    });
  });

  test("returns 404 when task disappears before delete persists", async () => {
    prismaMock.task.findUnique.mockResolvedValueOnce({
      id: "t1",
      projectId: "p1",
      attachments: [],
    });
    const notFoundError = Object.assign(new Error("record not found"), {
      code: "P2025",
    });
    prismaMock.task.delete.mockRejectedValueOnce(notFoundError);

    const request = new Request("http://localhost/api/projects/p1/tasks/t1", {
      method: "DELETE",
    });

    const response = await DELETE(request as never, {
      params: { projectId: "p1", taskId: "t1" },
    });

    expect(response.status).toBe(404);
    await expect(readJson(response)).resolves.toEqual({
      error: "Task not found",
    });
  });
});

describe("POST /api/projects/:projectId/tasks/:taskId/archive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.project.findFirst.mockResolvedValue({
      ownerId: "test-user",
      memberships: [],
    });
  });

  test("archives a done task", async () => {
    prismaMock.task.findUnique.mockResolvedValueOnce({
      id: "t1",
      projectId: "p1",
      status: "Done",
      archivedAt: null,
    });
    prismaMock.task.update.mockResolvedValueOnce({
      archivedAt: new Date("2026-03-11T09:30:00.000Z"),
    });

    const request = new Request("http://localhost/api/projects/p1/tasks/t1/archive", {
      method: "POST",
    });

    const response = await archiveTask(request as never, {
      params: { projectId: "p1", taskId: "t1" },
    });

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({
      ok: true,
      archivedAt: "2026-03-11T09:30:00.000Z",
    });
    expect(prismaMock.task.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: {
        archivedAt: expect.any(Date),
      },
      select: {
        archivedAt: true,
      },
    });
  });

  test("returns 400 when task is not done", async () => {
    prismaMock.task.findUnique.mockResolvedValueOnce({
      id: "t1",
      projectId: "p1",
      status: "In Progress",
      archivedAt: null,
    });

    const request = new Request("http://localhost/api/projects/p1/tasks/t1/archive", {
      method: "POST",
    });

    const response = await archiveTask(request as never, {
      params: { projectId: "p1", taskId: "t1" },
    });

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({
      error: "Only done tasks can be archived",
    });
    expect(prismaMock.task.update).not.toHaveBeenCalled();
  });

  test("returns existing archived timestamp when task is already archived", async () => {
    prismaMock.task.findUnique.mockResolvedValueOnce({
      id: "t1",
      projectId: "p1",
      status: "Done",
      archivedAt: new Date("2026-03-10T22:00:00.000Z"),
    });

    const request = new Request("http://localhost/api/projects/p1/tasks/t1/archive", {
      method: "POST",
    });

    const response = await archiveTask(request as never, {
      params: { projectId: "p1", taskId: "t1" },
    });

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({
      ok: true,
      archivedAt: "2026-03-10T22:00:00.000Z",
    });
    expect(prismaMock.task.update).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/projects/:projectId/tasks/:taskId/archive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.project.findFirst.mockResolvedValue({
      ownerId: "test-user",
      memberships: [],
    });
  });

  test("unarchives an archived done task", async () => {
    prismaMock.task.findUnique.mockResolvedValueOnce({
      id: "t1",
      projectId: "p1",
      status: "Done",
      archivedAt: new Date("2026-03-10T22:00:00.000Z"),
    });
    prismaMock.task.update.mockResolvedValueOnce({
      id: "t1",
    });

    const request = new Request("http://localhost/api/projects/p1/tasks/t1/archive", {
      method: "DELETE",
    });

    const response = await unarchiveTask(request as never, {
      params: { projectId: "p1", taskId: "t1" },
    });

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({
      ok: true,
    });
    expect(prismaMock.task.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: {
        archivedAt: null,
      },
      select: {
        id: true,
      },
    });
  });

  test("returns 400 when task is not done", async () => {
    prismaMock.task.findUnique.mockResolvedValueOnce({
      id: "t1",
      projectId: "p1",
      status: "Blocked",
      archivedAt: new Date("2026-03-10T22:00:00.000Z"),
    });

    const request = new Request("http://localhost/api/projects/p1/tasks/t1/archive", {
      method: "DELETE",
    });

    const response = await unarchiveTask(request as never, {
      params: { projectId: "p1", taskId: "t1" },
    });

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({
      error: "Only done tasks can be unarchived",
    });
  });
});
