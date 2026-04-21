import { beforeEach, describe, expect, test, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  task: {
    findFirst: vi.fn(),
    updateMany: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  },
  project: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  projectMembership: {
    findMany: vi.fn(),
  },
  user: {
    upsert: vi.fn(),
  },
  resource: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
  taskAttachment: {
    count: vi.fn(),
  },
  resourceAttachment: {
    count: vi.fn(),
  },
  googleCalendarCredential: {
    findUnique: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import {
  createProject,
  getProjectDashboardById,
  getProjectSummaryById,
  listProjectCollaborators,
  listProjectsWithCounts,
  listProjectContextResources,
  listProjectKanbanTasks,
} from "@/lib/services/project-service";
import { RESOURCE_TYPE_CONTEXT_CARD } from "@/lib/resource-type";

describe("project-service", () => {
  const actorUserId = "user-1";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("archives stale done tasks before loading dashboard", async () => {
    prismaMock.task.findFirst.mockResolvedValueOnce({ id: "task-1" });
    prismaMock.task.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.project.findFirst.mockResolvedValueOnce({ id: "project-1" });

    const result = await getProjectDashboardById("project-1", actorUserId);

    expect(result).toEqual({ id: "project-1" });
    expect(prismaMock.task.findFirst).toHaveBeenCalledTimes(1);
    expect(prismaMock.task.updateMany).toHaveBeenCalledTimes(1);

    const updateManyCall = prismaMock.task.updateMany.mock.calls[0][0];
    expect(updateManyCall.where).toMatchObject({
      projectId: "project-1",
      status: "Done",
      archivedAt: null,
    });
    expect(updateManyCall.where.OR).toHaveLength(2);
    expect(updateManyCall.where.OR[0].completedAt.lte).toBeInstanceOf(Date);
    expect(updateManyCall.where.OR[1].updatedAt.lte).toBeInstanceOf(Date);
    expect(updateManyCall.data).toEqual({ archivedAt: expect.any(Date) });
  });

  test("skips archive write when no stale done task exists", async () => {
    prismaMock.task.findFirst.mockResolvedValueOnce(null);
    prismaMock.project.findFirst.mockResolvedValueOnce({ id: "project-1" });

    await getProjectDashboardById("project-1", actorUserId);

    expect(prismaMock.task.findFirst).toHaveBeenCalledTimes(1);
    expect(prismaMock.task.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.project.findFirst).toHaveBeenCalledTimes(1);
  });

  test("loads summary with task count projection", async () => {
    prismaMock.project.findFirst.mockResolvedValueOnce({
      id: "project-1",
      name: "Project 1",
      description: null,
    });
    prismaMock.task.count
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1);
    prismaMock.resource.count.mockResolvedValueOnce(1);
    prismaMock.taskAttachment.count.mockResolvedValueOnce(3);
    prismaMock.resourceAttachment.count.mockResolvedValueOnce(3);
    prismaMock.googleCalendarCredential.findUnique.mockResolvedValueOnce({
      revokedAt: null,
    });

    const result = await getProjectSummaryById("project-1", actorUserId);

    expect(result).toMatchObject({
      id: "project-1",
      stats: {
        trackedTasks: 4,
        openTasks: 1,
        completedTasks: 1,
        contextCards: 1,
        attachmentCount: 6,
        isCalendarConnected: true,
      },
    });
    expect(prismaMock.project.findFirst).toHaveBeenCalledWith({
      where: {
        id: "project-1",
        OR: [
          { ownerId: actorUserId },
          { memberships: { some: { userId: actorUserId } } },
        ],
      },
      select: {
        id: true,
        name: true,
        description: true,
        ownerId: true,
        memberships: {
          where: { userId: actorUserId },
          select: {
            role: true,
          },
          take: 1,
        },
      },
    });
    expect(prismaMock.task.count).toHaveBeenNthCalledWith(1, {
      where: {
        projectId: "project-1",
        project: {
          OR: [
            { ownerId: actorUserId },
            { memberships: { some: { userId: actorUserId } } },
          ],
        },
      },
    });
    expect(prismaMock.task.count).toHaveBeenNthCalledWith(2, {
      where: {
        projectId: "project-1",
        project: {
          OR: [
            { ownerId: actorUserId },
            { memberships: { some: { userId: actorUserId } } },
          ],
        },
        archivedAt: null,
        status: {
          in: ["In Progress", "Blocked"],
        },
      },
    });
    expect(prismaMock.task.count).toHaveBeenNthCalledWith(3, {
      where: {
        projectId: "project-1",
        project: {
          OR: [
            { ownerId: actorUserId },
            { memberships: { some: { userId: actorUserId } } },
          ],
        },
        OR: [{ status: "Done" }, { archivedAt: { not: null } }],
      },
    });
    expect(prismaMock.resource.count).toHaveBeenCalledWith({
      where: {
        projectId: "project-1",
        project: {
          OR: [
            { ownerId: actorUserId },
            { memberships: { some: { userId: actorUserId } } },
          ],
        },
        type: RESOURCE_TYPE_CONTEXT_CARD,
      },
    });
    expect(prismaMock.taskAttachment.count).toHaveBeenCalledWith({
      where: {
        task: {
          projectId: "project-1",
          project: {
            OR: [
              { ownerId: actorUserId },
              { memberships: { some: { userId: actorUserId } } },
            ],
          },
        },
      },
    });
    expect(prismaMock.resourceAttachment.count).toHaveBeenCalledWith({
      where: {
        resource: {
          projectId: "project-1",
          project: {
            OR: [
              { ownerId: actorUserId },
              { memberships: { some: { userId: actorUserId } } },
            ],
          },
          type: RESOURCE_TYPE_CONTEXT_CARD,
        },
      },
    });
    expect(prismaMock.googleCalendarCredential.findUnique).toHaveBeenCalledWith({
      where: { userId: actorUserId },
      select: {
        revokedAt: true,
      },
    });
  });

  test("archives stale done tasks before loading kanban tasks", async () => {
    prismaMock.task.findFirst.mockResolvedValueOnce({ id: "task-1" });
    prismaMock.task.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.task.findMany.mockResolvedValueOnce([
      { id: "task-a", status: "Backlog" },
    ]);

    const result = await listProjectKanbanTasks("project-1", actorUserId);

    expect(result).toEqual([{ id: "task-a", status: "Backlog" }]);
    expect(prismaMock.task.findFirst).toHaveBeenCalledTimes(1);
    expect(prismaMock.task.updateMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.task.findMany).toHaveBeenCalledWith({
      where: {
        projectId: "project-1",
        project: {
          OR: [
            { ownerId: actorUserId },
            { memberships: { some: { userId: actorUserId } } },
          ],
        },
      },
      orderBy: [{ status: "asc" }, { position: "asc" }, { createdAt: "asc" }],
      include: {
        _count: {
          select: {
            comments: true,
          },
        },
        attachments: {
          orderBy: [{ createdAt: "desc" }],
        },
        blockedFollowUps: {
          orderBy: [{ createdAt: "desc" }],
        },
        outgoingRelations: {
          select: {
            rightTask: {
              select: {
                id: true,
                title: true,
                status: true,
                archivedAt: true,
              },
            },
          },
        },
        incomingRelations: {
          select: {
            leftTask: {
              select: {
                id: true,
                title: true,
                status: true,
                archivedAt: true,
              },
            },
          },
        },
        createdByUser: {
          select: {
            id: true,
            name: true,
            email: true,
            username: true,
            usernameDiscriminator: true,
            avatarSeed: true,
          },
        },
        updatedByUser: {
          select: {
            id: true,
            name: true,
            email: true,
            username: true,
            usernameDiscriminator: true,
            avatarSeed: true,
          },
        },
        assigneeUser: {
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

  test("lists project collaborators with owner included once", async () => {
    prismaMock.project.findFirst.mockResolvedValueOnce({
      owner: {
        id: "user-1",
        name: "Owner",
        email: "owner@example.com",
        username: "owner",
        usernameDiscriminator: "1111",
        avatarSeed: null,
      },
      memberships: [
        {
          user: {
            id: "user-1",
            name: "Owner Duplicate",
            email: "owner@example.com",
            username: "owner",
            usernameDiscriminator: "1111",
            avatarSeed: null,
          },
        },
        {
          user: {
            id: "user-2",
            name: "Editor",
            email: "editor@example.com",
            username: null,
            usernameDiscriminator: null,
            avatarSeed: "seed-editor",
          },
        },
      ],
    });

    const result = await listProjectCollaborators("project-1", actorUserId);

    expect(result).toEqual([
      {
        id: "user-1",
        displayName: "owner",
        usernameTag: "owner#1111",
        avatarSeed: "user-1",
      },
      {
        id: "user-2",
        displayName: "Editor",
        usernameTag: null,
        avatarSeed: "seed-editor",
      },
    ]);
    expect(prismaMock.project.findFirst).toHaveBeenCalledWith({
      where: {
        id: "project-1",
        OR: [
          { ownerId: actorUserId },
          { memberships: { some: { userId: actorUserId } } },
        ],
      },
      select: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            username: true,
            usernameDiscriminator: true,
            avatarSeed: true,
          },
        },
        memberships: {
          orderBy: [{ createdAt: "asc" }],
          select: {
            user: {
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
        },
      },
    });
  });

  test("loads context resources filtered to context-card type", async () => {
    prismaMock.resource.findMany.mockResolvedValueOnce([{ id: "res-1" }]);

    const result = await listProjectContextResources("project-1", actorUserId);

    expect(result).toEqual([{ id: "res-1" }]);
    expect(prismaMock.resource.findMany).toHaveBeenCalledWith({
      where: {
        projectId: "project-1",
        project: {
          OR: [
            { ownerId: actorUserId },
            { memberships: { some: { userId: actorUserId } } },
          ],
        },
        type: RESOURCE_TYPE_CONTEXT_CARD,
      },
      orderBy: [{ createdAt: "desc" }],
      include: {
        attachments: {
          orderBy: [{ createdAt: "desc" }],
        },
      },
    });
  });

  test("creates synthetic test user before project insert when actor is test-user", async () => {
    prismaMock.user.upsert.mockResolvedValueOnce({ id: "test-user" });
    prismaMock.project.create.mockResolvedValueOnce({ id: "project-1" });

    const result = await createProject({
      actorUserId: "test-user",
      name: "Project 1",
      description: null,
    });

    expect(result).toEqual({ id: "project-1" });
    expect(prismaMock.user.upsert).toHaveBeenCalledWith({
      where: { id: "test-user" },
      update: {},
      create: { id: "test-user" },
    });
    expect(prismaMock.project.create).toHaveBeenCalledWith({
      data: {
        ownerId: "test-user",
        name: "Project 1",
        description: null,
        memberships: {
          create: {
            userId: "test-user",
            role: "owner",
          },
        },
      },
    });
  });

  test("lists projects with owner and collaborator roles without nested membership reads", async () => {
    prismaMock.project.findMany.mockResolvedValueOnce([
      {
        id: "project-owner",
        name: "Owned project",
        description: null,
        ownerId: actorUserId,
        updatedAt: new Date("2026-03-20T10:00:00.000Z"),
        memberships: [],
        _count: {
          tasks: 2,
          resources: 1,
        },
      },
      {
        id: "project-editor",
        name: "Shared project",
        description: "Shared",
        ownerId: "user-2",
        updatedAt: new Date("2026-03-20T09:00:00.000Z"),
        memberships: [],
        _count: {
          tasks: 4,
          resources: 3,
        },
      },
    ]);
    prismaMock.projectMembership.findMany.mockResolvedValueOnce([
      {
        projectId: "project-editor",
        role: "editor",
      },
    ]);

    const result = await listProjectsWithCounts(actorUserId);

    expect(result).toEqual([
      {
        id: "project-owner",
        name: "Owned project",
        description: null,
        ownerId: actorUserId,
        updatedAt: new Date("2026-03-20T10:00:00.000Z"),
        memberships: [],
        _count: {
          tasks: 2,
          resources: 1,
        },
      },
      {
        id: "project-editor",
        name: "Shared project",
        description: "Shared",
        ownerId: "user-2",
        updatedAt: new Date("2026-03-20T09:00:00.000Z"),
        memberships: [{ role: "editor" }],
        _count: {
          tasks: 4,
          resources: 3,
        },
      },
    ]);

    expect(prismaMock.project.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { ownerId: actorUserId },
          { memberships: { some: { userId: actorUserId } } },
        ],
      },
      orderBy: [{ updatedAt: "desc" }],
      select: {
        id: true,
        name: true,
        description: true,
        ownerId: true,
        updatedAt: true,
        _count: {
          select: {
            tasks: true,
            resources: true,
          },
        },
      },
    });
    expect(prismaMock.projectMembership.findMany).toHaveBeenCalledWith({
      where: {
        userId: actorUserId,
        projectId: {
          in: ["project-editor"],
        },
      },
      select: {
        projectId: true,
        role: true,
      },
    });
  });

  test("rejects createProject when the runtime name is missing", async () => {
    await expect(
      createProject({
        actorUserId,
        name: undefined as unknown as string,
        description: undefined as unknown as string | null,
      })
    ).rejects.toThrow("project-name-required");

    expect(prismaMock.project.create).not.toHaveBeenCalled();
  });
});
