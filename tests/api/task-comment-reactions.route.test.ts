import { beforeEach, describe, expect, test, vi } from "vitest";

const projectAccessServiceMock = vi.hoisted(() => ({
  requireAgentProjectScopes: vi.fn(() => ({ ok: true })),
  requireProjectRole: vi.fn(() => Promise.resolve({ ok: true, role: "editor" as const })),
}));

const rlsContextMock = vi.hoisted(() => ({
  withActorRlsContext: vi.fn(),
}));

const apiGuardMock = vi.hoisted(() => ({
  getAgentProjectAccessContext: vi.fn(() => undefined),
  requireApiPrincipal: vi.fn(() => Promise.resolve({ ok: true, principal: { kind: "human", actorUserId: "test-user", requestId: "req-1" } })),
}));

vi.mock("@/lib/services/project-access-service", () => ({
  requireAgentProjectScopes: projectAccessServiceMock.requireAgentProjectScopes,
  requireProjectRole: projectAccessServiceMock.requireProjectRole,
}));

vi.mock("@/lib/services/rls-context", () => ({
  withActorRlsContext: rlsContextMock.withActorRlsContext,
}));

vi.mock("@/lib/auth/api-guard", () => ({
  getAgentProjectAccessContext: apiGuardMock.getAgentProjectAccessContext,
  requireApiPrincipal: apiGuardMock.requireApiPrincipal,
}));

import {
  listTaskCommentReactionsForComment,
  addTaskCommentReaction,
  removeTaskCommentReaction,
} from "@/lib/services/project-task-comment-service";

function createMockDb(overrides: Partial<{
  taskComment: { findUnique: ReturnType<typeof vi.fn> };
  task: { findUnique: ReturnType<typeof vi.fn> };
  taskCommentReaction: { findUnique: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
}> = {}) {
  return {
    taskComment: {
      findUnique: vi.fn(() => Promise.resolve({ id: "comment-1", taskId: "task-1" })),
      ...overrides.taskComment,
    },
    task: {
      findUnique: vi.fn(() => Promise.resolve({ id: "task-1", projectId: "project-1" })),
      ...overrides.task,
    },
    taskCommentReaction: {
      findUnique: vi.fn(() => null),
      findMany: vi.fn(() => []),
      create: vi.fn(() => Promise.resolve({ id: "r-new", emoji: "👍", userId: "test-user", commentId: "comment-1", createdAt: new Date() })),
      delete: vi.fn(() => Promise.resolve({ id: "r1", emoji: "👍", userId: "test-user", commentId: "comment-1", createdAt: new Date() })),
      deleteMany: vi.fn(() => Promise.resolve({ count: 1 })),
      ...overrides.taskCommentReaction,
    },
  };
}

describe("task comment reactions service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("listTaskCommentReactionsForComment returns grouped reactions", async () => {
    const mockDb = createMockDb({
      taskCommentReaction: {
        findMany: vi.fn(() => Promise.resolve([
          { id: "reaction-1", emoji: "👍", createdAt: new Date(), user: { id: "user-1", name: "Alice", email: "alice@example.com", username: "alice", usernameDiscriminator: "1234", avatarSeed: "seed-alice" } },
          { id: "reaction-2", emoji: "👍", createdAt: new Date(), user: { id: "test-user", name: "Me", email: "me@example.com", username: "me", usernameDiscriminator: "5678", avatarSeed: "seed-me" } },
          { id: "reaction-3", emoji: "🎉", createdAt: new Date(), user: { id: "user-2", name: "Bob", email: "bob@example.com", username: "bob", usernameDiscriminator: "9999", avatarSeed: "seed-bob" } },
        ])),
      },
    });
    rlsContextMock.withActorRlsContext.mockImplementationOnce(async (_actorUserId: string, operation: (db: unknown) => unknown) =>
      operation(mockDb as never)
    );

    const result = await listTaskCommentReactionsForComment({
      actorUserId: "test-user",
      projectId: "project-1",
      commentId: "comment-1",
    });

    expect(result.ok).toBe(true);
    const reactions = result.data?.reactions ?? [];
    expect(reactions).toContainEqual(expect.objectContaining({ emoji: "👍", count: 2, reacted: true }));
    expect(reactions).toContainEqual(expect.objectContaining({ emoji: "🎉", count: 1, reacted: false }));
  });

  test("listTaskCommentReactionsForComment returns 404 when comment not found", async () => {
    const mockDb = createMockDb({
      taskComment: { findUnique: vi.fn(() => Promise.resolve(null)) },
    });
    rlsContextMock.withActorRlsContext.mockImplementationOnce(async (_actorUserId: string, operation: (db: unknown) => unknown) =>
      operation(mockDb as never)
    );

    const result = await listTaskCommentReactionsForComment({
      actorUserId: "test-user",
      projectId: "project-1",
      commentId: "nonexistent",
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(404);
    expect(result.error).toBe("comment-not-found");
  });

  test("addTaskCommentReaction adds reaction when none exists", async () => {
    const mockDb = createMockDb({
      taskCommentReaction: {
        findMany: vi.fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([
            { id: "r-new", emoji: "👍", userId: "test-user", commentId: "comment-1", createdAt: new Date(), user: { id: "test-user", name: "Me", email: "m@example.com", username: "me", usernameDiscriminator: "5678", avatarSeed: "seed-me" } },
          ]),
      },
    });
    rlsContextMock.withActorRlsContext.mockImplementationOnce(async (_actorUserId: string, operation: (db: unknown) => unknown) =>
      operation(mockDb as never)
    );

    const result = await addTaskCommentReaction({
      actorUserId: "test-user",
      projectId: "project-1",
      commentId: "comment-1",
      emoji: "👍",
    });

    expect(result.ok).toBe(true);
    const reactions = result.data?.reactions ?? [];
    expect(reactions).toContainEqual(expect.objectContaining({ emoji: "👍", reacted: true }));
  });

  test("addTaskCommentReaction replaces existing reaction when switching emoji", async () => {
    const mockDb = createMockDb({
      taskCommentReaction: {
        findMany: vi.fn()
          .mockResolvedValueOnce([
            { id: "r1", emoji: "👍", userId: "test-user", commentId: "comment-1", createdAt: new Date(), user: { id: "test-user", name: "Me", email: "m@example.com", username: "me", usernameDiscriminator: "5678", avatarSeed: "seed-me" } },
          ])
          .mockResolvedValueOnce([
            { id: "r-new", emoji: "🎉", userId: "test-user", commentId: "comment-1", createdAt: new Date(), user: { id: "test-user", name: "Me", email: "m@example.com", username: "me", usernameDiscriminator: "5678", avatarSeed: "seed-me" } },
          ]),
      },
    });
    rlsContextMock.withActorRlsContext.mockImplementationOnce(async (_actorUserId: string, operation: (db: unknown) => unknown) =>
      operation(mockDb as never)
    );

    const result = await addTaskCommentReaction({
      actorUserId: "test-user",
      projectId: "project-1",
      commentId: "comment-1",
      emoji: "🎉",
    });

    expect(result.ok).toBe(true);
    const reactions = result.data?.reactions ?? [];
    expect(reactions).toContainEqual(expect.objectContaining({ emoji: "🎉", reacted: true }));
    expect(reactions).not.toContainEqual(expect.objectContaining({ emoji: "👍" }));
  });

  test("addTaskCommentReaction removes own reaction when clicking same emoji (toggle off)", async () => {
    const mockDb = createMockDb({
      taskCommentReaction: {
        findMany: vi.fn()
          .mockResolvedValueOnce([
            { id: "r1", emoji: "👍", userId: "test-user", commentId: "comment-1", createdAt: new Date(), user: { id: "test-user", name: "Me", email: "m@example.com", username: "me", usernameDiscriminator: "5678", avatarSeed: "seed-me" } },
          ])
          .mockResolvedValueOnce([]),
      },
    });
    rlsContextMock.withActorRlsContext.mockImplementationOnce(async (_actorUserId: string, operation: (db: unknown) => unknown) =>
      operation(mockDb as never)
    );

    const result = await addTaskCommentReaction({
      actorUserId: "test-user",
      projectId: "project-1",
      commentId: "comment-1",
      emoji: "👍",
    });

    expect(result.ok).toBe(true);
    expect(result.data?.reactions).toEqual([]);
  });

  test("addTaskCommentReaction returns 400 when emoji is empty", async () => {
    const result = await addTaskCommentReaction({
      actorUserId: "test-user",
      projectId: "project-1",
      commentId: "comment-1",
      emoji: "",
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(result.error).toBe("emoji-required");
  });

  test("removeTaskCommentReaction removes owned reaction", async () => {
    const mockDb = createMockDb({
      taskCommentReaction: {
        findUnique: vi.fn(() => Promise.resolve({
          id: "r1", emoji: "👍", userId: "test-user", commentId: "comment-1", createdAt: new Date(),
          comment: { id: "comment-1", taskId: "task-1" },
        })),
        findMany: vi.fn(() => Promise.resolve([])),
      },
    });
    rlsContextMock.withActorRlsContext.mockImplementationOnce(async (_actorUserId: string, operation: (db: unknown) => unknown) =>
      operation(mockDb as never)
    );

    const result = await removeTaskCommentReaction({
      actorUserId: "test-user",
      projectId: "project-1",
      reactionId: "r1",
    });

    expect(result.ok).toBe(true);
    expect(result.data?.reactions).toEqual([]);
  });

  test("removeTaskCommentReaction returns 404 when reaction not found", async () => {
    const mockDb = createMockDb({
      taskCommentReaction: { findUnique: vi.fn(() => Promise.resolve(null)) },
    });
    rlsContextMock.withActorRlsContext.mockImplementationOnce(async (_actorUserId: string, operation: (db: unknown) => unknown) =>
      operation(mockDb as never)
    );

    const result = await removeTaskCommentReaction({
      actorUserId: "test-user",
      projectId: "project-1",
      reactionId: "nonexistent",
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(404);
    expect(result.error).toBe("reaction-not-found");
  });

  test("removeTaskCommentReaction returns 403 when actor does not own reaction", async () => {
    const mockDb = createMockDb({
      taskCommentReaction: {
        findUnique: vi.fn(() => Promise.resolve({
          id: "r1", emoji: "👍", userId: "other-user", commentId: "comment-1", createdAt: new Date(),
          comment: { id: "comment-1", taskId: "task-1" },
        })),
      },
    });
    rlsContextMock.withActorRlsContext.mockImplementationOnce(async (_actorUserId: string, operation: (db: unknown) => unknown) =>
      operation(mockDb as never)
    );

    const result = await removeTaskCommentReaction({
      actorUserId: "test-user",
      projectId: "project-1",
      reactionId: "r1",
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
    expect(result.error).toBe("not-reaction-owner");
  });
});