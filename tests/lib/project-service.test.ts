import { beforeEach, describe, expect, test, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  task: {
    findFirst: vi.fn(),
    updateMany: vi.fn(),
    findMany: vi.fn(),
  },
  project: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
  },
  resource: {
    findMany: vi.fn(),
  },
}));

const actorServiceMock = vi.hoisted(() => ({
  resolveActorUserId: vi.fn(),
}));

const projectAuthorizationMock = vi.hoisted(() => ({
  buildProjectAccessWhere: vi.fn(),
  hasProjectAccess: vi.fn(),
  ensureProjectOwnerMembership: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/services/actor-service", () => ({
  resolveActorUserId: actorServiceMock.resolveActorUserId,
}));

vi.mock("@/lib/services/project-authorization-service", () => ({
  buildProjectAccessWhere: projectAuthorizationMock.buildProjectAccessWhere,
  hasProjectAccess: projectAuthorizationMock.hasProjectAccess,
  ensureProjectOwnerMembership:
    projectAuthorizationMock.ensureProjectOwnerMembership,
}));

import {
  getProjectDashboardById,
  getProjectSummaryById,
  listProjectContextResources,
  listProjectKanbanTasks,
} from "@/lib/services/project-service";
import { RESOURCE_TYPE_CONTEXT_CARD } from "@/lib/resource-type";

describe("project-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actorServiceMock.resolveActorUserId.mockResolvedValue("bootstrap-owner");
    projectAuthorizationMock.buildProjectAccessWhere.mockReturnValue({});
    projectAuthorizationMock.hasProjectAccess.mockResolvedValue(true);
    projectAuthorizationMock.ensureProjectOwnerMembership.mockResolvedValue(
      undefined
    );
  });

  test("archives stale done tasks before loading dashboard", async () => {
    prismaMock.task.findFirst.mockResolvedValueOnce({ id: "task-1" });
    prismaMock.task.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.project.findUnique.mockResolvedValueOnce({ id: "project-1" });

    const result = await getProjectDashboardById("project-1");

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
    prismaMock.project.findUnique.mockResolvedValueOnce({ id: "project-1" });

    await getProjectDashboardById("project-1");

    expect(prismaMock.task.findFirst).toHaveBeenCalledTimes(1);
    expect(prismaMock.task.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.project.findUnique).toHaveBeenCalledTimes(1);
  });

  test("loads summary with task count projection", async () => {
    prismaMock.project.findFirst.mockResolvedValueOnce({
      id: "project-1",
      name: "Project 1",
      description: null,
      _count: {
        tasks: 4,
      },
    });

    const result = await getProjectSummaryById("project-1");

    expect(result).toMatchObject({
      id: "project-1",
      _count: {
        tasks: 4,
      },
    });
    expect(prismaMock.project.findFirst).toHaveBeenCalledWith({
      where: { id: "project-1" },
      select: {
        id: true,
        name: true,
        description: true,
        _count: {
          select: {
            tasks: true,
          },
        },
      },
    });
  });

  test("archives stale done tasks before loading kanban tasks", async () => {
    prismaMock.task.findFirst.mockResolvedValueOnce({ id: "task-1" });
    prismaMock.task.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.task.findMany.mockResolvedValueOnce([
      { id: "task-a", status: "Backlog" },
    ]);

    const result = await listProjectKanbanTasks("project-1");

    expect(result).toEqual([{ id: "task-a", status: "Backlog" }]);
    expect(prismaMock.task.findFirst).toHaveBeenCalledTimes(1);
    expect(prismaMock.task.updateMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.task.findMany).toHaveBeenCalledWith({
      where: { projectId: "project-1" },
      orderBy: [{ status: "asc" }, { position: "asc" }, { createdAt: "asc" }],
      include: {
        attachments: {
          orderBy: [{ createdAt: "desc" }],
        },
        blockedFollowUps: {
          orderBy: [{ createdAt: "desc" }],
        },
      },
    });
  });

  test("loads context resources filtered to context-card type", async () => {
    prismaMock.resource.findMany.mockResolvedValueOnce([{ id: "res-1" }]);

    const result = await listProjectContextResources("project-1");

    expect(result).toEqual([{ id: "res-1" }]);
    expect(prismaMock.resource.findMany).toHaveBeenCalledWith({
      where: {
        projectId: "project-1",
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
});
