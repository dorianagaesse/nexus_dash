import { beforeEach, describe, expect, test, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  project: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  task: {
    aggregate: vi.fn(),
    create: vi.fn(),
    findUnique: vi.fn(),
    delete: vi.fn(),
  },
  taskRelation: {
    deleteMany: vi.fn(),
    createMany: vi.fn(),
  },
  apiCredential: {
    findFirst: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import {
  createTaskForProject,
  type CreateTaskForProjectInput,
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
    assigneeUserId: null,
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

describe("createTaskForProject attribution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
