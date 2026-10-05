import { beforeEach, describe, expect, test, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  $queryRaw: vi.fn(),
  project: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  task: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  taskComment: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  taskAttachment: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
  taskCommentAgentMention: {
    findMany: vi.fn(),
    deleteMany: vi.fn(),
    createMany: vi.fn(),
  },
  apiCredential: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
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

import { PATCH } from "@/app/api/projects/[projectId]/tasks/[taskId]/comments/[commentId]/route";

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("PATCH /api/projects/[projectId]/tasks/[taskId]/comments/[commentId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (callback) =>
      callback(prismaMock)
    );
    apiGuardMock.requireApiPrincipal.mockResolvedValue({
      ok: true,
      principal: {
        kind: "human",
        actorUserId: "user-1",
        requestId: "request-1",
      },
    });
    apiGuardMock.getAgentProjectAccessContext.mockReturnValue(undefined);
    prismaMock.project.findFirst.mockResolvedValue({
      ownerId: "user-1",
      memberships: [],
    });
    prismaMock.project.update.mockResolvedValue({ id: "project-1" });
    prismaMock.task.update.mockResolvedValue({ id: "task-1" });
    prismaMock.apiCredential.findFirst.mockResolvedValue(null);
    prismaMock.apiCredential.findMany.mockResolvedValue([]);
    prismaMock.$queryRaw.mockResolvedValue([]);
    prismaMock.taskCommentAgentMention.findMany.mockResolvedValue([]);
    prismaMock.taskCommentAgentMention.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.taskCommentAgentMention.createMany.mockResolvedValue({ count: 0 });
  });

  test("returns 400 when route parameters are missing", async () => {
    const response = await PATCH(
      new Request("https://nexusdash.test", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "Updated" }),
      }) as never,
      {
        params: Promise.resolve({
          projectId: "",
          taskId: "task-1",
          commentId: "comment-1",
        }),
      }
    );

    expect(response.status).toBe(400);
  });

  test("returns 400 on invalid JSON body", async () => {
    const response = await PATCH(
      new Request("https://nexusdash.test", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: "{malformed json",
      }) as never,
      {
        params: Promise.resolve({
          projectId: "project-1",
          taskId: "task-1",
          commentId: "comment-1",
        }),
      }
    );

    expect(response.status).toBe(400);
  });

  test("returns 400 when body is null or not an object", async () => {
    const response = await PATCH(
      new Request("https://nexusdash.test", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: "null",
      }) as never,
      {
        params: Promise.resolve({
          projectId: "project-1",
          taskId: "task-1",
          commentId: "comment-1",
        }),
      }
    );

    expect(response.status).toBe(400);
    const payload = await readJson(response);
    expect(payload.error).toBe("Invalid JSON payload");
  });

  test("returns 400 when content is missing or not a string", async () => {
    const response = await PATCH(
      new Request("https://nexusdash.test", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: 123 }),
      }) as never,
      {
        params: Promise.resolve({
          projectId: "project-1",
          taskId: "task-1",
          commentId: "comment-1",
        }),
      }
    );

    expect(response.status).toBe(400);
    const payload = await readJson(response);
    expect(payload.error).toBe("Invalid JSON payload");
  });

  test("returns 400 when content is empty and comment has no attachments", async () => {
    prismaMock.task.findUnique.mockResolvedValueOnce({
      id: "task-1",
      title: "Task 1",
      projectId: "project-1",
    });
    prismaMock.taskComment.findUnique.mockResolvedValueOnce({
      id: "comment-1",
      taskId: "task-1",
      authorUserId: "user-1",
      authorAgentCredentialId: null,
      attachments: [],
    });

    const response = await PATCH(
      new Request("https://nexusdash.test", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "   " }),
      }) as never,
      {
        params: Promise.resolve({
          projectId: "project-1",
          taskId: "task-1",
          commentId: "comment-1",
        }),
      }
    );

    expect(response.status).toBe(400);
    const payload = await readJson(response);
    expect(payload.error).toBe("content-required");
  });

  test("returns 400 when content exceeds 4000 characters", async () => {
    const response = await PATCH(
      new Request("https://nexusdash.test", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "a".repeat(4001) }),
      }) as never,
      {
        params: Promise.resolve({
          projectId: "project-1",
          taskId: "task-1",
          commentId: "comment-1",
        }),
      }
    );

    expect(response.status).toBe(400);
    const payload = await readJson(response);
    expect(payload.error).toBe("content-too-long");
  });

  test("returns 404 when task is not found", async () => {
    prismaMock.task.findUnique.mockResolvedValueOnce(null);

    const response = await PATCH(
      new Request("https://nexusdash.test", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "Updated content" }),
      }) as never,
      {
        params: Promise.resolve({
          projectId: "project-1",
          taskId: "task-missing",
          commentId: "comment-1",
        }),
      }
    );

    expect(response.status).toBe(404);
    const payload = await readJson(response);
    expect(payload.error).toBe("task-not-found");
  });

  test("returns 404 when comment is not found", async () => {
    prismaMock.task.findUnique.mockResolvedValueOnce({
      id: "task-1",
      title: "Task 1",
      projectId: "project-1",
    });
    prismaMock.taskComment.findUnique.mockResolvedValueOnce(null);

    const response = await PATCH(
      new Request("https://nexusdash.test", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "Updated content" }),
      }) as never,
      {
        params: Promise.resolve({
          projectId: "project-1",
          taskId: "task-1",
          commentId: "comment-missing",
        }),
      }
    );

    expect(response.status).toBe(404);
    const payload = await readJson(response);
    expect(payload.error).toBe("comment-not-found");
  });

  test("returns 403 when a user tries to edit someone else's comment", async () => {
    prismaMock.task.findUnique.mockResolvedValueOnce({
      id: "task-1",
      title: "Task 1",
      projectId: "project-1",
    });
    prismaMock.taskComment.findUnique.mockResolvedValueOnce({
      id: "comment-1",
      taskId: "task-1",
      authorUserId: "other-user",
      authorAgentCredentialId: null,
      attachments: [],
    });

    const response = await PATCH(
      new Request("https://nexusdash.test", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "Updated content" }),
      }) as never,
      {
        params: Promise.resolve({
          projectId: "project-1",
          taskId: "task-1",
          commentId: "comment-1",
        }),
      }
    );

    expect(response.status).toBe(403);
    const payload = await readJson(response);
    expect(payload.error).toBe("forbidden");
  });

  test("returns 403 when a user tries to edit an agent's comment", async () => {
    prismaMock.task.findUnique.mockResolvedValueOnce({
      id: "task-1",
      title: "Task 1",
      projectId: "project-1",
    });
    prismaMock.taskComment.findUnique.mockResolvedValueOnce({
      id: "comment-1",
      taskId: "task-1",
      authorUserId: "user-1",
      authorAgentCredentialId: "cred-agent-1",
      attachments: [],
    });

    const response = await PATCH(
      new Request("https://nexusdash.test", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "Updated content" }),
      }) as never,
      {
        params: Promise.resolve({
          projectId: "project-1",
          taskId: "task-1",
          commentId: "comment-1",
        }),
      }
    );

    expect(response.status).toBe(403);
    const payload = await readJson(response);
    expect(payload.error).toBe("forbidden");
  });

  test("returns 403 when an agent lacks task:write scope", async () => {
    apiGuardMock.requireApiPrincipal.mockResolvedValueOnce({
      ok: true,
      principal: {
        kind: "agent",
        actorUserId: "user-owner",
        credentialId: "cred-1",
        projectId: "project-1",
        scopes: ["task:read"],
        requestId: "request-agent-1",
      },
    });
    apiGuardMock.getAgentProjectAccessContext.mockReturnValueOnce({
      credentialId: "cred-1",
      projectId: "project-1",
      scopes: ["task:read"],
    });

    const response = await PATCH(
      new Request("https://nexusdash.test", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "Updated content" }),
      }) as never,
      {
        params: Promise.resolve({
          projectId: "project-1",
          taskId: "task-1",
          commentId: "comment-1",
        }),
      }
    );

    expect(response.status).toBe(403);
    const payload = await readJson(response);
    expect(payload.error).toBe("forbidden");
  });

  test("returns 403 when an agent tries to edit a different agent's comment", async () => {
    apiGuardMock.requireApiPrincipal.mockResolvedValueOnce({
      ok: true,
      principal: {
        kind: "agent",
        actorUserId: "user-owner",
        credentialId: "cred-agent-1",
        projectId: "project-1",
        scopes: ["task:write"],
        requestId: "request-agent-1",
      },
    });
    apiGuardMock.getAgentProjectAccessContext.mockReturnValueOnce({
      credentialId: "cred-agent-1",
      projectId: "project-1",
      scopes: ["task:write"],
    });
    prismaMock.project.findFirst.mockResolvedValueOnce({
      ownerId: "user-owner",
      memberships: [],
    });
    prismaMock.task.findUnique.mockResolvedValueOnce({
      id: "task-1",
      title: "Task 1",
      projectId: "project-1",
    });
    prismaMock.taskComment.findUnique.mockResolvedValueOnce({
      id: "comment-1",
      taskId: "task-1",
      authorUserId: "user-owner",
      authorAgentCredentialId: "cred-agent-2", // Different agent!
      attachments: [],
    });

    const response = await PATCH(
      new Request("https://nexusdash.test", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "Updated content" }),
      }) as never,
      {
        params: Promise.resolve({
          projectId: "project-1",
          taskId: "task-1",
          commentId: "comment-1",
        }),
      }
    );

    expect(response.status).toBe(403);
    const payload = await readJson(response);
    expect(payload.error).toBe("forbidden");
  });

  test("successfully updates comment by human author", async () => {
    prismaMock.task.findUnique.mockResolvedValueOnce({
      id: "task-1",
      title: "Task 1",
      projectId: "project-1",
    });
    prismaMock.taskComment.findUnique.mockResolvedValueOnce({
      id: "comment-1",
      taskId: "task-1",
      authorUserId: "user-1",
      authorAgentCredentialId: null,
      attachments: [
        {
          id: "att-1",
        },
      ],
    });

    const updatedAt = new Date("2026-10-04T12:00:00Z");
    prismaMock.taskComment.update.mockResolvedValueOnce({
      id: "comment-1",
      content: "<p>Updated comment body</p>",
      createdAt: new Date("2026-10-04T10:00:00Z"),
      updatedAt,
      authorAgentCredentialId: null,
      authorAgentCredentialLabel: null,
      author: {
        id: "user-1",
        name: "Test User",
        email: "user@test.com",
        username: "testuser",
        usernameDiscriminator: "0001",
        avatarSeed: "avatar-1",
      },
      attachments: [
        {
          id: "att-1",
          commentId: "comment-1",
          kind: "file",
          name: "design.png",
          url: "https://files.nexusdash.test/design.png",
          mimeType: "image/png",
          sizeBytes: 1024,
        },
      ],
    });

    const response = await PATCH(
      new Request("https://nexusdash.test", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "Updated comment body" }),
      }) as never,
      {
        params: Promise.resolve({
          projectId: "project-1",
          taskId: "task-1",
          commentId: "comment-1",
        }),
      }
    );

    expect(response.status).toBe(200);
    const payload = await readJson(response);
    expect(payload.comment).toMatchObject({
      id: "comment-1",
      content: "<p>Updated comment body</p>",
      author: {
        id: "user-1",
        kind: "user",
        displayName: "testuser",
      },
      attachments: [
        {
          id: "att-1",
          name: "design.png",
        },
      ],
    });
    expect(payload.comment).toHaveProperty("updatedAt");
    expect(prismaMock.taskComment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "comment-1" },
        data: { content: "<p>Updated comment body</p>" },
      })
    );
  });

  test("allows empty content if comment has existing attachments", async () => {
    prismaMock.task.findUnique.mockResolvedValueOnce({
      id: "task-1",
      title: "Task 1",
      projectId: "project-1",
    });
    prismaMock.taskComment.findUnique.mockResolvedValueOnce({
      id: "comment-1",
      taskId: "task-1",
      authorUserId: "user-1",
      authorAgentCredentialId: null,
      attachments: [{ id: "att-1" }],
    });

    prismaMock.taskComment.update.mockResolvedValueOnce({
      id: "comment-1",
      content: "",
      createdAt: new Date("2026-10-04T10:00:00Z"),
      updatedAt: new Date("2026-10-04T12:00:00Z"),
      authorAgentCredentialId: null,
      authorAgentCredentialLabel: null,
      author: {
        id: "user-1",
        name: "Test User",
        email: "user@test.com",
        username: "testuser",
        usernameDiscriminator: "0001",
        avatarSeed: "avatar-1",
      },
      attachments: [],
    });

    const response = await PATCH(
      new Request("https://nexusdash.test", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "" }),
      }) as never,
      {
        params: Promise.resolve({
          projectId: "project-1",
          taskId: "task-1",
          commentId: "comment-1",
        }),
      }
    );

    expect(response.status).toBe(200);
  });

  test("successfully updates comment by matching agent author", async () => {
    apiGuardMock.requireApiPrincipal.mockResolvedValueOnce({
      ok: true,
      principal: {
        kind: "agent",
        actorUserId: "user-owner",
        credentialId: "cred-agent-1",
        projectId: "project-1",
        scopes: ["task:write"],
        requestId: "request-agent-1",
      },
    });
    apiGuardMock.getAgentProjectAccessContext.mockReturnValueOnce({
      credentialId: "cred-agent-1",
      projectId: "project-1",
      scopes: ["task:write"],
    });
    prismaMock.project.findFirst.mockResolvedValueOnce({
      ownerId: "user-owner",
      memberships: [],
    });
    prismaMock.task.findUnique.mockResolvedValueOnce({
      id: "task-1",
      title: "Task 1",
      projectId: "project-1",
    });
    prismaMock.taskComment.findUnique.mockResolvedValueOnce({
      id: "comment-1",
      taskId: "task-1",
      authorUserId: "user-owner",
      authorAgentCredentialId: "cred-agent-1",
      attachments: [],
    });
    prismaMock.apiCredential.findFirst.mockResolvedValueOnce({
      label: "CodeReviewBot",
    });

    const updatedAt = new Date("2026-10-04T12:00:00Z");
    prismaMock.taskComment.update.mockResolvedValueOnce({
      id: "comment-1",
      content: "<p>Agent updated content</p>",
      createdAt: new Date("2026-10-04T10:00:00Z"),
      updatedAt,
      authorAgentCredentialId: "cred-agent-1",
      authorAgentCredentialLabel: "CodeReviewBot",
      author: {
        id: "user-owner",
        name: "Project Owner",
        email: "owner@test.com",
        username: "owner",
        usernameDiscriminator: "0001",
        avatarSeed: "avatar-owner",
      },
      attachments: [],
    });

    const response = await PATCH(
      new Request("https://nexusdash.test", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "Agent updated content" }),
      }) as never,
      {
        params: Promise.resolve({
          projectId: "project-1",
          taskId: "task-1",
          commentId: "comment-1",
        }),
      }
    );

    expect(response.status).toBe(200);
    const payload = await readJson(response);
    expect(payload.comment).toMatchObject({
      id: "comment-1",
      content: "<p>Agent updated content</p>",
      author: {
        kind: "agent",
        displayName: "CodeReviewBot (agent)",
        agentCredentialId: "cred-agent-1",
      },
    });
  });

  test("returns 403 when comment was authored by an agent whose credential was deleted", async () => {
    prismaMock.task.findUnique.mockResolvedValueOnce({
      id: "task-1",
      title: "Task 1",
      projectId: "project-1",
    });
    prismaMock.taskComment.findUnique.mockResolvedValueOnce({
      id: "comment-1",
      taskId: "task-1",
      authorUserId: "user-1",
      authorAgentCredentialId: null,
      authorAgentCredentialLabel: "DeletedAgent",
      attachments: [],
    });

    const response = await PATCH(
      new Request("https://nexusdash.test", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "Human attempting to edit deleted agent comment" }),
      }) as never,
      {
        params: Promise.resolve({
          projectId: "project-1",
          taskId: "task-1",
          commentId: "comment-1",
        }),
      }
    );

    expect(response.status).toBe(403);
    const payload = await readJson(response);
    expect(payload.error).toBe("forbidden");
  });
});
