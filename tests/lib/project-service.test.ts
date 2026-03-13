import { beforeEach, describe, expect, test, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  task: {
    findFirst: vi.fn(),
    updateMany: vi.fn(),
    findMany: vi.fn(),
  },
  project: {
    create: vi.fn(),
    findFirst: vi.fn(),
  },
  user: {
    upsert: vi.fn(),
  },
  resource: {
    findMany: vi.fn(),
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
      tasks: [
        {
          status: "In Progress",
          archivedAt: null,
          _count: {
            attachments: 2,
          },
        },
        {
          status: "Done",
          archivedAt: null,
          label: null,
          labelsJson: null,
          _count: {
            attachments: 1,
          },
        },
      ],
      resources: [
        {
          _count: {
            attachments: 3,
          },
        },
      ],
      _count: {
        tasks: 4,
      },
    });
    prismaMock.googleCalendarCredential.findUnique.mockResolvedValueOnce({
      revokedAt: null,
    });

    const result = await getProjectSummaryById("project-1", actorUserId);

    expect(result).toMatchObject({
      id: "project-1",
      _count: {
        tasks: 4,
      },
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
        tasks: {
          select: {
            status: true,
            archivedAt: true,
            _count: {
              select: {
                attachments: true,
              },
            },
          },
        },
        resources: {
          where: {
            type: RESOURCE_TYPE_CONTEXT_CARD,
          },
          select: {
            _count: {
              select: {
                attachments: true,
              },
            },
          },
        },
        _count: {
          select: {
            tasks: true,
          },
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
});
