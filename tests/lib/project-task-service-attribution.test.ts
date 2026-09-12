import { beforeEach, describe, expect, test, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  project: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  task: {
    aggregate: vi.fn(),
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
  },
  taskRelation: {
    deleteMany: vi.fn(),
    createMany: vi.fn(),
  },
  taskAssigneeChange: {
    create: vi.fn(),
  },
  apiCredential: {
    findFirst: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import {
  archiveTaskForProject,
  createTaskForProject,
  moveTaskStatusForProject,
  reorderProjectTasks,
  type CreateTaskForProjectInput,
  unarchiveTaskForProject,
  updateTaskForProject,
} from "@/lib/services/project-task-service";
import { AGENT_TASK_AUTHOR_AVATAR_SEED } from "@/lib/task-author";
import type { TaskPersonRecord } from "@/lib/task-person";

const ownerRecord: TaskPersonRecord = {
  id: "owner-1",
  name: "Owner Example",
  email: "owner@example.com",
  username: "owner",
  usernameDiscriminator: "1234",
  avatarSeed: null,
};

const ownerSummary = {
  id: "owner-1",
  displayName: "owner",
  usernameTag: "owner#1234",
  avatarSeed: "owner-1",
};

function buildCreateInput(
  overrides?: Partial<CreateTaskForProjectInput>
): CreateTaskForProjectInput {
  return {
    actorUserId: "owner-1",
    projectId: "project-1",
    title: "Ship actor attribution",
    description: "<p>Body</p>",
    deadlineDate: "",
    epicId: null,
    assignee: null,
    labelsJsonRaw: "",
    relatedTaskIdsJsonRaw: "",
    attachmentLinksJsonRaw: "",
    attachmentFiles: [],
    ...overrides,
  };
}

function buildStoredTask(credentialOverrides: {
  createdByCredentialId: string | null;
  createdByCredentialLabel: string | null;
  updatedByCredentialId: string | null;
  updatedByCredentialLabel: string | null;
}) {
  return {
    id: "task-1",
    referenceNumber: 42,
    title: "Ship actor attribution",
    label: null,
    labelsJson: "[]",
    description: "<p>Body</p>",
    deadlineAt: null,
    blockedNote: null,
    status: "Backlog",
    position: 4,
    completedAt: null,
    archivedAt: null,
    createdAt: new Date("2026-09-06T09:00:00.000Z"),
    updatedAt: new Date("2026-09-06T09:00:00.000Z"),
    _count: { comments: 0 },
    attachments: [],
    epic: null,
    assigneeUser: null,
    createdByUser: ownerRecord,
    updatedByUser: ownerRecord,
    outgoingRelations: [],
    incomingRelations: [],
    blockedFollowUps: [],
    ...credentialOverrides,
  };
}

function queueCreateFlow(storedTask: ReturnType<typeof buildStoredTask>) {
  prismaMock.project.findFirst.mockResolvedValueOnce({
    id: "project-1",
    ownerId: "owner-1",
    memberships: [],
  });
  prismaMock.task.aggregate.mockResolvedValueOnce({ _max: { position: 3 } });
  prismaMock.task.create.mockResolvedValueOnce({ id: "task-1" });
  prismaMock.taskRelation.deleteMany.mockResolvedValueOnce({ count: 0 });
  prismaMock.project.update.mockResolvedValueOnce({ id: "project-1" });
  prismaMock.task.findUnique.mockResolvedValueOnce(storedTask);
}

function revokedAgentRegistryRow(id = "cred-revoked") {
  return {
    kind: "agent",
    actorId: id,
    name: null,
    email: null,
    username: null,
    usernameDiscriminator: null,
    avatarSeed: null,
    label: "Retired bot",
    revokedAt: new Date("2026-09-01T00:00:00.000Z"),
    expiresAt: null,
  };
}

describe("createTaskForProject attribution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$queryRaw.mockResolvedValue([]);
    prismaMock.user.findUnique.mockResolvedValue(ownerRecord);
  });

  test("human execution keeps createdByUserId and persists null credential attribution", async () => {
    queueCreateFlow(
      buildStoredTask({
        createdByCredentialId: null,
        createdByCredentialLabel: null,
        updatedByCredentialId: null,
        updatedByCredentialLabel: null,
      })
    );

    const result = await createTaskForProject(buildCreateInput());

    if (!result.ok) {
      throw new Error("expected create to succeed");
    }

    expect(prismaMock.apiCredential.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          createdByUserId: "owner-1",
          updatedByUserId: "owner-1",
          createdByCredentialId: null,
          createdByCredentialLabel: null,
          updatedByCredentialId: null,
          updatedByCredentialLabel: null,
        }),
      })
    );
    expect(result.data.task.createdBy).toEqual({
      ...ownerSummary,
      kind: "user",
      agentCredentialId: null,
      agentCredentialLabel: null,
      owner: null,
    });
    expect(result.data.task.updatedBy).toEqual(result.data.task.createdBy);
  });

  test("agent execution snapshots the acting credential id and trimmed label", async () => {
    prismaMock.apiCredential.findFirst.mockResolvedValueOnce({
      id: "cred-1",
      label: "  Release bot  ",
    });
    queueCreateFlow(
      buildStoredTask({
        createdByCredentialId: "cred-1",
        createdByCredentialLabel: "Release bot",
        updatedByCredentialId: "cred-1",
        updatedByCredentialLabel: "Release bot",
      })
    );

    const result = await createTaskForProject(
      buildCreateInput({
        agentAccess: {
          credentialId: "cred-1",
          projectId: "project-1",
          scopes: ["task:write"],
        },
      })
    );

    if (!result.ok) {
      throw new Error("expected create to succeed");
    }

    expect(prismaMock.apiCredential.findFirst).toHaveBeenCalledWith({
      where: { id: "cred-1", projectId: "project-1" },
      select: { id: true, label: true },
    });
    expect(prismaMock.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          createdByUserId: "owner-1",
          updatedByUserId: "owner-1",
          createdByCredentialId: "cred-1",
          createdByCredentialLabel: "Release bot",
          updatedByCredentialId: "cred-1",
          updatedByCredentialLabel: "Release bot",
        }),
      })
    );
    expect(result.data.task.createdBy).toEqual({
      id: "cred-1",
      kind: "agent",
      displayName: "Release bot (agent)",
      usernameTag: null,
      avatarSeed: AGENT_TASK_AUTHOR_AVATAR_SEED,
      agentCredentialId: "cred-1",
      agentCredentialLabel: "Release bot",
      owner: ownerSummary,
    });
    expect(result.data.task.updatedBy).toEqual(result.data.task.createdBy);
  });

  test("agent execution degrades to human-only attribution when the credential row is gone", async () => {
    prismaMock.apiCredential.findFirst.mockResolvedValueOnce(null);
    queueCreateFlow(
      buildStoredTask({
        createdByCredentialId: null,
        createdByCredentialLabel: null,
        updatedByCredentialId: null,
        updatedByCredentialLabel: null,
      })
    );

    const result = await createTaskForProject(
      buildCreateInput({
        agentAccess: {
          credentialId: "cred-missing",
          projectId: "project-1",
          scopes: ["task:write"],
        },
      })
    );

    if (!result.ok) {
      throw new Error("expected create to succeed");
    }

    expect(prismaMock.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          createdByCredentialId: null,
          createdByCredentialLabel: null,
          updatedByCredentialId: null,
          updatedByCredentialLabel: null,
        }),
      })
    );
    expect(result.data.task.createdBy).toEqual({
      ...ownerSummary,
      kind: "user",
      agentCredentialId: null,
      agentCredentialLabel: null,
      owner: null,
    });
  });

  test("rejects a revoked credential as the create assignee", async () => {
    prismaMock.project.findFirst.mockResolvedValueOnce({
      id: "project-1",
      ownerId: "owner-1",
      memberships: [],
    });
    prismaMock.$queryRaw.mockResolvedValueOnce([revokedAgentRegistryRow()]);

    const result = await createTaskForProject(
      buildCreateInput({ assignee: { kind: "agent", id: "cred-revoked" } })
    );

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "assignee-invalid",
    });
    expect(prismaMock.task.create).not.toHaveBeenCalled();
  });
});

describe("task mutation attribution", () => {
  const agentAccess = {
    credentialId: "cred-1",
    projectId: "project-1",
    scopes: ["task:write"],
  } as const;

  function queueAgentCredential() {
    prismaMock.apiCredential.findFirst.mockResolvedValueOnce({
      id: "cred-1",
      label: "Release bot",
    });
  }

  function queueProjectAccess() {
    prismaMock.project.findFirst.mockResolvedValueOnce({
      id: "project-1",
      ownerId: "owner-1",
      memberships: [],
    });
  }

  function expectAgentUpdateAttribution() {
    expect(prismaMock.task.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          updatedByUserId: "owner-1",
          updatedByCredentialId: "cred-1",
          updatedByCredentialLabel: "Release bot",
        }),
      })
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$queryRaw.mockResolvedValue([]);
    prismaMock.user.findUnique.mockResolvedValue(ownerRecord);
  });

  test("records agent attribution when reordering tasks", async () => {
    queueProjectAccess();
    prismaMock.task.findMany.mockResolvedValueOnce([
      {
        id: "task-1",
        status: "Backlog",
        position: 0,
        archivedAt: null,
        completedAt: null,
      },
    ]);
    queueAgentCredential();
    prismaMock.task.update.mockResolvedValueOnce({ id: "task-1" });
    prismaMock.project.update.mockResolvedValueOnce({ id: "project-1" });

    const result = await reorderProjectTasks(
      "project-1",
      { columns: [{ status: "In Progress", taskIds: ["task-1"] }] },
      "owner-1",
      agentAccess
    );

    expect(result).toEqual({ ok: true, data: { ok: true } });
    expectAgentUpdateAttribution();
  });

  test("records agent attribution when changing task status", async () => {
    queueProjectAccess();
    prismaMock.task.findUnique
      .mockResolvedValueOnce({
        id: "task-1",
        projectId: "project-1",
        status: "Backlog",
        position: 0,
        archivedAt: null,
        completedAt: null,
      })
      .mockResolvedValueOnce(
        buildStoredTask({
          createdByCredentialId: null,
          createdByCredentialLabel: null,
          updatedByCredentialId: "cred-1",
          updatedByCredentialLabel: "Release bot",
        })
      );
    prismaMock.task.findMany.mockResolvedValueOnce([]);
    queueAgentCredential();
    prismaMock.task.update.mockResolvedValueOnce({ id: "task-1" });
    prismaMock.task.updateMany.mockResolvedValueOnce({ count: 0 });
    prismaMock.project.update.mockResolvedValueOnce({ id: "project-1" });

    const result = await moveTaskStatusForProject(
      "project-1",
      "task-1",
      { status: "In Progress" },
      "owner-1",
      agentAccess
    );

    expect(result.ok).toBe(true);
    expectAgentUpdateAttribution();
  });

  test("records agent attribution when editing task fields", async () => {
    queueProjectAccess();
    prismaMock.task.findUnique
      .mockResolvedValueOnce({
        id: "task-1",
        projectId: "project-1",
        status: "Backlog",
        position: 0,
        epicId: null,
        assigneeUserId: null,
        outgoingRelations: [],
        incomingRelations: [],
      })
      .mockResolvedValueOnce(
        buildStoredTask({
          createdByCredentialId: null,
          createdByCredentialLabel: null,
          updatedByCredentialId: "cred-1",
          updatedByCredentialLabel: "Release bot",
        })
      );
    queueAgentCredential();
    prismaMock.task.update.mockResolvedValueOnce({ id: "task-1" });
    prismaMock.project.update.mockResolvedValueOnce({ id: "project-1" });

    const result = await updateTaskForProject(
      "project-1",
      "task-1",
      { title: "Updated task" },
      "owner-1",
      agentAccess
    );

    expect(result.ok).toBe(true);
    expectAgentUpdateAttribution();
  });

  test("records agent attribution when archiving and unarchiving a task", async () => {
    queueProjectAccess();
    prismaMock.task.findUnique.mockResolvedValueOnce({
      id: "task-1",
      projectId: "project-1",
      status: "Done",
      archivedAt: null,
    });
    queueAgentCredential();
    prismaMock.task.update.mockResolvedValueOnce({ archivedAt: new Date() });
    prismaMock.project.update.mockResolvedValueOnce({ id: "project-1" });

    const archiveResult = await archiveTaskForProject(
      "project-1",
      "task-1",
      "owner-1",
      agentAccess
    );

    expect(archiveResult.ok).toBe(true);
    expectAgentUpdateAttribution();

    vi.clearAllMocks();
    queueProjectAccess();
    prismaMock.task.findUnique.mockResolvedValueOnce({
      id: "task-1",
      projectId: "project-1",
      status: "Done",
      archivedAt: new Date(),
    });
    queueAgentCredential();
    prismaMock.task.update.mockResolvedValueOnce({ id: "task-1" });
    prismaMock.project.update.mockResolvedValueOnce({ id: "project-1" });

    const unarchiveResult = await unarchiveTaskForProject(
      "project-1",
      "task-1",
      "owner-1",
      agentAccess
    );

    expect(unarchiveResult).toEqual({ ok: true, data: { ok: true } });
    expectAgentUpdateAttribution();
  });

  test("rejects a revoked credential when editing the assignee", async () => {
    queueProjectAccess();
    prismaMock.task.findUnique.mockResolvedValueOnce({
      id: "task-1",
      projectId: "project-1",
      status: "Backlog",
      position: 0,
      epicId: null,
      assigneeKind: null,
      assigneeUserId: null,
      assigneeCredentialId: null,
      assigneeDisplayNameSnapshot: null,
      outgoingRelations: [],
      incomingRelations: [],
    });
    prismaMock.$queryRaw.mockResolvedValueOnce([revokedAgentRegistryRow()]);

    const result = await updateTaskForProject(
      "project-1",
      "task-1",
      { assignee: { kind: "agent", id: "cred-revoked" } },
      "owner-1"
    );

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "assignee-invalid",
    });
    expect(prismaMock.task.update).not.toHaveBeenCalled();
    expect(prismaMock.taskAssigneeChange.create).not.toHaveBeenCalled();
  });
});
