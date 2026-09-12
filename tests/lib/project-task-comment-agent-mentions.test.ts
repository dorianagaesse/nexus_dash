import { beforeEach, describe, expect, test, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
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
    create: vi.fn(),
  },
  taskCommentAgentMention: {
    findMany: vi.fn(),
    deleteMany: vi.fn(),
    createMany: vi.fn(),
  },
  notification: {
    findMany: vi.fn(),
    createMany: vi.fn(),
    updateMany: vi.fn(),
  },
  apiCredential: {
    findFirst: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: dbMock,
}));

vi.mock("@/lib/services/rls-context", () => ({
  withActorRlsContext: vi.fn(
    (_actorUserId: string, callback: (db: typeof dbMock) => unknown) =>
      callback(dbMock)
  ),
}));

import {
  createTaskCommentForProject,
  syncTaskCommentAgentMentions,
} from "@/lib/services/project-task-comment-service";

const HUMAN_ROW = {
  kind: "human",
  actorId: "user-1",
  name: "Reviewer",
  email: "reviewer@example.com",
  username: "reviewer",
  usernameDiscriminator: "0007",
  avatarSeed: null,
  label: null,
  revokedAt: null,
  expiresAt: null,
};

function agentRow(input: {
  actorId: string;
  label: string;
  revokedAt?: Date | null;
  expiresAt?: Date | null;
}) {
  return {
    kind: "agent",
    actorId: input.actorId,
    name: null,
    email: null,
    username: null,
    usernameDiscriminator: null,
    avatarSeed: null,
    label: input.label,
    revokedAt: input.revokedAt ?? null,
    expiresAt: input.expiresAt ?? null,
  };
}

const CREATED_COMMENT = {
  id: "comment-1",
  content: "@{Release bot} please cut the release",
  createdAt: new Date("2026-09-12T10:00:00.000Z"),
  authorAgentCredentialId: null,
  authorAgentCredentialLabel: null,
  author: {
    id: "user-1",
    name: "Reviewer",
    email: "reviewer@example.com",
    username: "reviewer",
    usernameDiscriminator: "0007",
    avatarSeed: null,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.$transaction.mockImplementation(async (callback) =>
    callback(dbMock)
  );
  dbMock.project.findFirst.mockResolvedValue({
    ownerId: "user-1",
    memberships: [{ role: "editor" }],
  });
  dbMock.project.update.mockResolvedValue({ id: "project-1" });
  dbMock.task.findUnique.mockResolvedValue({
    id: "task-1",
    title: "Release task",
    projectId: "project-1",
  });
  dbMock.task.update.mockResolvedValue({ id: "task-1" });
  dbMock.taskComment.create.mockResolvedValue(CREATED_COMMENT);
  dbMock.taskCommentAgentMention.findMany.mockResolvedValue([]);
  dbMock.taskCommentAgentMention.deleteMany.mockResolvedValue({ count: 0 });
  dbMock.taskCommentAgentMention.createMany.mockResolvedValue({ count: 1 });
  dbMock.notification.findMany.mockResolvedValue([]);
  dbMock.notification.createMany.mockResolvedValue({ count: 1 });
  dbMock.apiCredential.findFirst.mockResolvedValue(null);
  dbMock.$queryRaw.mockResolvedValue([
    HUMAN_ROW,
    agentRow({ actorId: "credential-active", label: "Release bot" }),
  ]);
});

describe("createTaskCommentForProject agent mentions", () => {
  test("persists a tagged-agent event with credential and actor snapshots", async () => {
    const result = await createTaskCommentForProject({
      actorUserId: "user-1",
      projectId: "project-1",
      taskId: "task-1",
      content: "@{Release bot} please cut the release",
      agentMentionSelections: [{ credentialId: "credential-active" }],
    });

    expect(result.ok).toBe(true);
    expect(dbMock.taskCommentAgentMention.findMany).toHaveBeenCalledWith({
      where: { commentId: "comment-1" },
      select: { id: true, agentCredentialId: true },
    });
    expect(dbMock.taskCommentAgentMention.createMany).toHaveBeenCalledWith({
      data: [
        {
          commentId: "comment-1",
          taskId: "task-1",
          agentCredentialId: "credential-active",
          agentLabel: "Release bot",
          createdByUserId: "user-1",
          createdByCredentialId: null,
          createdByCredentialLabel: null,
        },
      ],
      skipDuplicates: true,
    });
  });

  test("records the authoring agent credential as the event actor", async () => {
    dbMock.apiCredential.findFirst.mockResolvedValueOnce({
      label: "Build bot",
    });
    dbMock.taskComment.create.mockResolvedValueOnce({
      ...CREATED_COMMENT,
      authorAgentCredentialId: "credential-actor",
      authorAgentCredentialLabel: "Build bot",
    });

    const result = await createTaskCommentForProject({
      actorUserId: "user-1",
      projectId: "project-1",
      taskId: "task-1",
      content: "@{Release bot} please cut the release",
      agentMentionSelections: [{ credentialId: "credential-active" }],
      agentAccess: {
        credentialId: "credential-actor",
        projectId: "project-1",
        scopes: ["task:write"],
      },
    });

    expect(result.ok).toBe(true);
    expect(dbMock.taskCommentAgentMention.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          agentCredentialId: "credential-active",
          agentLabel: "Release bot",
          createdByUserId: "user-1",
          createdByCredentialId: "credential-actor",
          createdByCredentialLabel: "Build bot",
        }),
      ],
      skipDuplicates: true,
    });
  });

  test("rejects a credential that is not an active project agent", async () => {
    dbMock.$queryRaw.mockResolvedValueOnce([
      HUMAN_ROW,
      agentRow({ actorId: "credential-active", label: "Release bot" }),
      agentRow({
        actorId: "credential-revoked",
        label: "Retired bot",
        revokedAt: new Date("2026-09-01T00:00:00.000Z"),
      }),
      agentRow({
        actorId: "credential-expired",
        label: "Stale bot",
        expiresAt: new Date("2026-09-08T00:00:00.000Z"),
      }),
    ]);

    for (const credentialId of [
      "credential-outside-project",
      "credential-revoked",
      "credential-expired",
    ]) {
      const result = await createTaskCommentForProject({
        actorUserId: "user-1",
        projectId: "project-1",
        taskId: "task-1",
        content: "@{Release bot} please cut the release",
        agentMentionSelections: [{ credentialId }],
      });

      expect(result).toEqual({
        ok: false,
        status: 400,
        error: "task-comment-agent-mention-invalid",
      });
    }

    expect(dbMock.taskComment.create).not.toHaveBeenCalled();
    expect(dbMock.taskCommentAgentMention.createMany).not.toHaveBeenCalled();
  });

  test("rejects a selection without the exact token in the content", async () => {
    const result = await createTaskCommentForProject({
      actorUserId: "user-1",
      projectId: "project-1",
      taskId: "task-1",
      content: "Ping Release bot without the token",
      agentMentionSelections: [{ credentialId: "credential-active" }],
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "task-comment-agent-mention-invalid",
    });
    expect(dbMock.taskComment.create).not.toHaveBeenCalled();
  });

  test("returns project-not-found when the actor registry is empty", async () => {
    dbMock.$queryRaw.mockResolvedValueOnce([]);

    const result = await createTaskCommentForProject({
      actorUserId: "user-1",
      projectId: "project-1",
      taskId: "task-1",
      content: "@{Release bot} please cut the release",
      agentMentionSelections: [{ credentialId: "credential-active" }],
    });

    expect(result).toEqual({
      ok: false,
      status: 404,
      error: "project-not-found",
    });
  });

  test("collapses duplicate selections and blank ids into one event", async () => {
    const result = await createTaskCommentForProject({
      actorUserId: "user-1",
      projectId: "project-1",
      taskId: "task-1",
      content: "@{Release bot} @{Release bot} ping",
      agentMentionSelections: [
        { credentialId: "credential-active" },
        { credentialId: "  credential-active  " },
        { credentialId: "   " },
      ],
    });

    expect(result.ok).toBe(true);
    expect(dbMock.taskCommentAgentMention.createMany).toHaveBeenCalledTimes(1);
    expect(dbMock.taskCommentAgentMention.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          agentCredentialId: "credential-active",
          agentLabel: "Release bot",
        }),
      ],
      skipDuplicates: true,
    });
  });

  test("keeps plain comments free of agent events", async () => {
    dbMock.taskComment.create.mockResolvedValueOnce({
      ...CREATED_COMMENT,
      content: "No mentions here",
    });

    const result = await createTaskCommentForProject({
      actorUserId: "user-1",
      projectId: "project-1",
      taskId: "task-1",
      content: "No mentions here",
    });

    expect(result.ok).toBe(true);
    expect(dbMock.$queryRaw).not.toHaveBeenCalled();
    expect(dbMock.taskCommentAgentMention.findMany).toHaveBeenCalledWith({
      where: { commentId: "comment-1" },
      select: { id: true, agentCredentialId: true },
    });
    expect(dbMock.taskCommentAgentMention.createMany).not.toHaveBeenCalled();
    expect(dbMock.taskCommentAgentMention.deleteMany).not.toHaveBeenCalled();
  });
});

describe("syncTaskCommentAgentMentions", () => {
  const actor = {
    userId: "user-1",
    credentialId: null,
    credentialLabel: null,
  };

  test("re-syncing the same desired set writes nothing", async () => {
    dbMock.taskCommentAgentMention.findMany.mockResolvedValueOnce([
      { id: "mention-1", agentCredentialId: "credential-1" },
    ]);

    await syncTaskCommentAgentMentions({
      db: dbMock as never,
      commentId: "comment-1",
      taskId: "task-1",
      desiredMentions: [{ credentialId: "credential-1", label: "Release bot" }],
      actor,
    });

    expect(dbMock.taskCommentAgentMention.deleteMany).not.toHaveBeenCalled();
    expect(dbMock.taskCommentAgentMention.createMany).not.toHaveBeenCalled();
  });

  test("retracts events whose credential is no longer mentioned", async () => {
    dbMock.taskCommentAgentMention.findMany.mockResolvedValueOnce([
      { id: "mention-1", agentCredentialId: "credential-1" },
      { id: "mention-2", agentCredentialId: "credential-2" },
    ]);

    await syncTaskCommentAgentMentions({
      db: dbMock as never,
      commentId: "comment-1",
      taskId: "task-1",
      desiredMentions: [{ credentialId: "credential-1", label: "Release bot" }],
      actor,
    });

    expect(dbMock.taskCommentAgentMention.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["mention-2"] } },
    });
    expect(dbMock.taskCommentAgentMention.createMany).not.toHaveBeenCalled();
  });

  test("never retracts events whose credential row was deleted", async () => {
    dbMock.taskCommentAgentMention.findMany.mockResolvedValueOnce([
      { id: "mention-1", agentCredentialId: null },
    ]);

    await syncTaskCommentAgentMentions({
      db: dbMock as never,
      commentId: "comment-1",
      taskId: "task-1",
      desiredMentions: [],
      actor,
    });

    expect(dbMock.taskCommentAgentMention.deleteMany).not.toHaveBeenCalled();
    expect(dbMock.taskCommentAgentMention.createMany).not.toHaveBeenCalled();
  });

  test("adds only newly mentioned credentials with actor snapshots", async () => {
    dbMock.taskCommentAgentMention.findMany.mockResolvedValueOnce([
      { id: "mention-1", agentCredentialId: "credential-1" },
    ]);

    await syncTaskCommentAgentMentions({
      db: dbMock as never,
      commentId: "comment-1",
      taskId: "task-1",
      desiredMentions: [
        { credentialId: "credential-1", label: "Release bot" },
        { credentialId: "credential-2", label: "Triage bot" },
      ],
      actor: {
        userId: "user-1",
        credentialId: "credential-actor",
        credentialLabel: "Build bot",
      },
    });

    expect(dbMock.taskCommentAgentMention.createMany).toHaveBeenCalledWith({
      data: [
        {
          commentId: "comment-1",
          taskId: "task-1",
          agentCredentialId: "credential-2",
          agentLabel: "Triage bot",
          createdByUserId: "user-1",
          createdByCredentialId: "credential-actor",
          createdByCredentialLabel: "Build bot",
        },
      ],
      skipDuplicates: true,
    });
  });
});
