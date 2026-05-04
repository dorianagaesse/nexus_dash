import { beforeEach, describe, expect, test, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  project: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
  },
  task: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  taskComment: {
    findMany: vi.fn(),
    create: vi.fn(),
  },
  notification: {
    findMany: vi.fn(),
    createMany: vi.fn(),
    updateMany: vi.fn(),
  },
}));

const apiGuardMock = vi.hoisted(() => ({
  getAgentProjectAccessContext: vi.fn(),
  requireApiPrincipal: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/auth/api-guard", () => ({
  getAgentProjectAccessContext: apiGuardMock.getAgentProjectAccessContext,
  requireApiPrincipal: apiGuardMock.requireApiPrincipal,
}));

import {
  GET,
  POST,
} from "@/app/api/projects/[projectId]/tasks/[taskId]/comments/route";

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("task comments route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (callback) =>
      callback(prismaMock)
    );
    apiGuardMock.requireApiPrincipal.mockResolvedValue({
      ok: true,
      principal: {
        kind: "human",
        actorUserId: "test-user",
        requestId: "request-1",
      },
    });
    apiGuardMock.getAgentProjectAccessContext.mockReturnValue(undefined);
    prismaMock.project.findFirst.mockResolvedValue({
      ownerId: "test-user",
      memberships: [],
    });
    prismaMock.notification.findMany.mockResolvedValue([]);
    prismaMock.notification.createMany.mockResolvedValue({ count: 1 });
    prismaMock.notification.updateMany.mockResolvedValue({ count: 1 });
  });

  test("GET returns chronological task comments", async () => {
    prismaMock.task.findUnique.mockResolvedValueOnce({
      id: "task-1",
      projectId: "project-1",
    });
    prismaMock.taskComment.findMany.mockResolvedValueOnce([
      {
        id: "comment-1",
        content: "First update",
        createdAt: new Date("2026-04-19T09:00:00.000Z"),
        author: {
          id: "user-1",
          name: "Alice Example",
          email: "alice@example.com",
          username: "alice",
          usernameDiscriminator: "1234",
          avatarSeed: null,
        },
      },
      {
        id: "comment-2",
        content: "Second update",
        createdAt: new Date("2026-04-19T10:00:00.000Z"),
        author: {
          id: "user-2",
          name: null,
          email: "bob@example.com",
          username: null,
          usernameDiscriminator: null,
          avatarSeed: "seed-222",
        },
      },
    ]);

    const response = await GET(
      new Request(
        "http://localhost/api/projects/project-1/tasks/task-1/comments"
      ) as never,
      { params: Promise.resolve({ projectId: "project-1", taskId: "task-1" }) }
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({
      comments: [
        {
          id: "comment-1",
          content: "First update",
          createdAt: "2026-04-19T09:00:00.000Z",
          author: {
            id: "user-1",
            displayName: "alice",
            usernameTag: "alice#1234",
            avatarSeed: "user-1",
          },
        },
        {
          id: "comment-2",
          content: "Second update",
          createdAt: "2026-04-19T10:00:00.000Z",
          author: {
            id: "user-2",
            displayName: "bob",
            usernameTag: null,
            avatarSeed: "seed-222",
          },
        },
      ],
    });
    expect(prismaMock.taskComment.findMany).toHaveBeenCalledWith({
      where: {
        taskId: "task-1",
      },
      orderBy: [{ createdAt: "asc" }],
      select: {
        id: true,
        content: true,
        createdAt: true,
        author: {
          select: {
            id: true,
            name: true,
            email: true,
            username: true,
            usernameDiscriminator: true,
            avatarSeed: true,
          },
        },
      },
    });
  });

  test("GET returns 404 when task is outside the project", async () => {
    prismaMock.task.findUnique.mockResolvedValueOnce({
      id: "task-1",
      projectId: "project-2",
    });

    const response = await GET(
      new Request(
        "http://localhost/api/projects/project-1/tasks/task-1/comments"
      ) as never,
      { params: Promise.resolve({ projectId: "project-1", taskId: "task-1" }) }
    );

    expect(response.status).toBe(404);
    await expect(readJson(response)).resolves.toEqual({
      error: "task-not-found",
    });
    expect(prismaMock.taskComment.findMany).not.toHaveBeenCalled();
  });

  test("POST returns 400 for invalid json payload", async () => {
    const response = await POST(
      new Request(
        "http://localhost/api/projects/project-1/tasks/task-1/comments",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{",
        }
      ) as never,
      { params: Promise.resolve({ projectId: "project-1", taskId: "task-1" }) }
    );

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({
      error: "Invalid JSON payload",
    });
  });

  test("POST creates a task comment", async () => {
    prismaMock.task.findUnique.mockResolvedValueOnce({
      id: "task-1",
      projectId: "project-1",
    });
    prismaMock.taskComment.create.mockResolvedValueOnce({
      id: "comment-3",
      content: "Ready for review",
      createdAt: new Date("2026-04-19T11:00:00.000Z"),
      author: {
        id: "test-user",
        name: "Reviewer",
        email: "reviewer@example.com",
        username: "reviewer",
        usernameDiscriminator: "0007",
        avatarSeed: null,
      },
    });

    const response = await POST(
      new Request(
        "http://localhost/api/projects/project-1/tasks/task-1/comments",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            content: "  Ready for review  ",
          }),
        }
      ) as never,
      { params: Promise.resolve({ projectId: "project-1", taskId: "task-1" }) }
    );

    expect(response.status).toBe(201);
    await expect(readJson(response)).resolves.toEqual({
      comment: {
        id: "comment-3",
        content: "Ready for review",
        createdAt: "2026-04-19T11:00:00.000Z",
        author: {
          id: "test-user",
          displayName: "reviewer",
          usernameTag: "reviewer#0007",
          avatarSeed: "test-user",
        },
      },
    });
    expect(prismaMock.taskComment.create).toHaveBeenCalledWith({
      data: {
        taskId: "task-1",
        authorUserId: "test-user",
        content: "Ready for review",
      },
      select: {
        id: true,
        content: true,
        createdAt: true,
        author: {
          select: {
            id: true,
            name: true,
            email: true,
            username: true,
            usernameDiscriminator: true,
            avatarSeed: true,
          },
        },
      },
    });
    expect(prismaMock.task.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: {
        updatedByUserId: "test-user",
      },
      select: {
        id: true,
      },
    });
    expect(prismaMock.project.findUnique).not.toHaveBeenCalled();
  });

  test("POST persists comment before creating mention notifications", async () => {
    prismaMock.task.findUnique.mockResolvedValueOnce({
      id: "task-1",
      title: "Mentionable task",
      projectId: "project-1",
    });
    prismaMock.project.findUnique.mockResolvedValueOnce({
      id: "project-1",
      name: "Test project",
      ownerId: "owner-1",
      owner: {
        id: "owner-1",
        name: "Owner",
        email: "owner@example.com",
        username: "owner",
        usernameDiscriminator: "0001",
        avatarSeed: null,
      },
      memberships: [
        {
          userId: "test-user",
          user: {
            id: "test-user",
            name: "Reviewer",
            email: "reviewer@example.com",
            username: "reviewer",
            usernameDiscriminator: "0007",
            avatarSeed: null,
          },
        },
      ],
    });
    prismaMock.taskComment.create.mockResolvedValueOnce({
      id: "comment-mention",
      content: "Can you check this @owner#0001?",
      createdAt: new Date("2026-04-19T11:30:00.000Z"),
      author: {
        id: "test-user",
        name: "Reviewer",
        email: "reviewer@example.com",
        username: "reviewer",
        usernameDiscriminator: "0007",
        avatarSeed: null,
      },
    });

    const response = await POST(
      new Request(
        "http://localhost/api/projects/project-1/tasks/task-1/comments",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            content: "Can you check this @owner#0001?",
          }),
        }
      ) as never,
      { params: Promise.resolve({ projectId: "project-1", taskId: "task-1" }) }
    );

    expect(response.status).toBe(201);
    expect(
      prismaMock.taskComment.create.mock.invocationCallOrder[0]
    ).toBeLessThan(
      prismaMock.notification.createMany.mock.invocationCallOrder[0]
    );
    expect(prismaMock.notification.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          recipientUserId: "owner-1",
          sourceType: "task_comment_mention",
          sourceId: "comment-mention",
          targetPath: "/projects/project-1/tasks/task-1",
        }),
      ],
      skipDuplicates: true,
    });
  });

  test("POST does not notify discriminator-less ambiguous username mentions", async () => {
    prismaMock.task.findUnique.mockResolvedValueOnce({
      id: "task-1",
      title: "Ambiguous mention task",
      projectId: "project-1",
    });
    prismaMock.project.findUnique.mockResolvedValueOnce({
      id: "project-1",
      name: "Test project",
      owner: {
        id: "owner-1",
        name: "Alice Owner",
        email: "owner@example.com",
        username: "alice",
        usernameDiscriminator: "0001",
      },
      memberships: [
        {
          userId: "member-1",
          user: {
            id: "member-1",
            name: "Alice Member",
            email: "alice@example.com",
            username: "alice",
            usernameDiscriminator: "0002",
          },
        },
      ],
    });
    prismaMock.taskComment.create.mockResolvedValueOnce({
      id: "comment-ambiguous",
      content: "Can @alice check this?",
      createdAt: new Date("2026-04-19T11:45:00.000Z"),
      author: {
        id: "test-user",
        name: "Reviewer",
        email: "reviewer@example.com",
        username: "reviewer",
        usernameDiscriminator: "0007",
        avatarSeed: null,
      },
    });

    const response = await POST(
      new Request(
        "http://localhost/api/projects/project-1/tasks/task-1/comments",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            content: "Can @alice check this?",
          }),
        }
      ) as never,
      { params: Promise.resolve({ projectId: "project-1", taskId: "task-1" }) }
    );

    expect(response.status).toBe(201);
    expect(prismaMock.notification.createMany).not.toHaveBeenCalled();
  });

  test("POST resolves selected display-only comment mentions without persisting discriminators", async () => {
    prismaMock.task.findUnique.mockResolvedValueOnce({
      id: "task-1",
      title: "Selected mention task",
      projectId: "project-1",
    });
    prismaMock.project.findUnique.mockResolvedValueOnce({
      id: "project-1",
      name: "Test project",
      owner: {
        id: "owner-1",
        name: "Alice Owner",
        email: "owner@example.com",
        username: "alice",
        usernameDiscriminator: "0001",
      },
      memberships: [
        {
          userId: "member-1",
          user: {
            id: "member-1",
            name: "Alice Member",
            email: "alice@example.com",
            username: "alice",
            usernameDiscriminator: "0002",
          },
        },
      ],
    });
    prismaMock.taskComment.create.mockResolvedValueOnce({
      id: "comment-selected",
      content: "Can @alice check this?",
      createdAt: new Date("2026-04-19T12:00:00.000Z"),
      author: {
        id: "test-user",
        name: "Reviewer",
        email: "reviewer@example.com",
        username: "reviewer",
        usernameDiscriminator: "0007",
        avatarSeed: null,
      },
    });

    const response = await POST(
      new Request(
        "http://localhost/api/projects/project-1/tasks/task-1/comments",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            content: "Can @alice check this?",
            mentionSelections: [
              {
                userId: "member-1",
                username: "alice",
                discriminator: "0002",
              },
            ],
          }),
        }
      ) as never,
      { params: Promise.resolve({ projectId: "project-1", taskId: "task-1" }) }
    );

    expect(response.status).toBe(201);
    expect(prismaMock.taskComment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          content: "Can @alice check this?",
        }),
      })
    );
    expect(prismaMock.notification.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          recipientUserId: "member-1",
          sourceType: "task_comment_mention",
          sourceId: "comment-selected",
          targetPath: "/projects/project-1/tasks/task-1",
        }),
      ],
      skipDuplicates: true,
    });
  });

  test("POST returns 400 for empty content", async () => {
    const response = await POST(
      new Request(
        "http://localhost/api/projects/project-1/tasks/task-1/comments",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            content: "   ",
          }),
        }
      ) as never,
      { params: Promise.resolve({ projectId: "project-1", taskId: "task-1" }) }
    );

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({
      error: "content-required",
    });
    expect(prismaMock.task.findUnique).not.toHaveBeenCalled();
  });
});
