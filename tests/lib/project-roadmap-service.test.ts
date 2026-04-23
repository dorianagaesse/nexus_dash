import { beforeEach, describe, expect, test, vi } from "vitest";

const projectAccessServiceMock = vi.hoisted(() => ({
  requireProjectRole: vi.fn(),
}));

const rlsContextMock = vi.hoisted(() => ({
  withActorRlsContext: vi.fn(),
}));

const loggerMock = vi.hoisted(() => ({
  logServerError: vi.fn(),
}));

const dbMock = vi.hoisted(() => ({
  roadmapMilestone: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    aggregate: vi.fn(),
  },
}));

vi.mock("@/lib/services/project-access-service", () => ({
  requireProjectRole: projectAccessServiceMock.requireProjectRole,
}));

vi.mock("@/lib/services/rls-context", () => ({
  withActorRlsContext: rlsContextMock.withActorRlsContext,
}));

vi.mock("@/lib/observability/logger", () => ({
  logServerError: loggerMock.logServerError,
}));

import {
  createProjectRoadmapMilestone,
  isValidRoadmapReorderPayload,
  listProjectRoadmapMilestones,
  reorderProjectRoadmapMilestones,
} from "@/lib/services/project-roadmap-service";

describe("project-roadmap-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    projectAccessServiceMock.requireProjectRole.mockResolvedValue({
      ok: true,
      role: "owner",
    });
    rlsContextMock.withActorRlsContext.mockImplementation(
      async (_actorUserId: string, operation: (db: typeof dbMock) => unknown) =>
        operation(dbMock)
    );
  });

  test("lists roadmap milestones ordered and serialized for viewers", async () => {
    dbMock.roadmapMilestone.findMany.mockResolvedValueOnce([
      {
        id: "milestone-1",
        title: "Private beta",
        description: "Open the first external wave.",
        targetDate: new Date("2026-05-02T00:00:00.000Z"),
        status: "active",
        position: 0,
        createdAt: new Date("2026-04-20T08:00:00.000Z"),
        updatedAt: new Date("2026-04-21T09:30:00.000Z"),
      },
    ]);

    const result = await listProjectRoadmapMilestones("project-1", "user-1");

    expect(result).toEqual([
      {
        id: "milestone-1",
        title: "Private beta",
        description: "Open the first external wave.",
        targetDate: "2026-05-02",
        status: "active",
        position: 0,
        createdAt: "2026-04-20T08:00:00.000Z",
        updatedAt: "2026-04-21T09:30:00.000Z",
      },
    ]);
    expect(projectAccessServiceMock.requireProjectRole).toHaveBeenCalledWith({
      actorUserId: "user-1",
      projectId: "project-1",
      minimumRole: "viewer",
      db: dbMock,
    });
    expect(dbMock.roadmapMilestone.findMany).toHaveBeenCalledWith({
      where: {
        projectId: "project-1",
      },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        title: true,
        description: true,
        targetDate: true,
        status: true,
        position: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  });

  test("creates roadmap milestone with sequential position and serialized target date", async () => {
    dbMock.roadmapMilestone.aggregate.mockResolvedValueOnce({
      _max: {
        position: 2,
      },
    });
    dbMock.roadmapMilestone.create.mockResolvedValueOnce({
      id: "milestone-3",
    });
    dbMock.roadmapMilestone.findFirst.mockResolvedValueOnce({
      id: "milestone-3",
      title: "Public launch",
      description: "Make the roadmap public.",
      targetDate: new Date("2026-06-14T00:00:00.000Z"),
      status: "planned",
      position: 3,
      createdAt: new Date("2026-04-23T08:00:00.000Z"),
      updatedAt: new Date("2026-04-23T08:00:00.000Z"),
    });

    const result = await createProjectRoadmapMilestone({
      actorUserId: "user-1",
      projectId: "project-1",
      title: "Public launch",
      description: "Make the roadmap public.",
      targetDate: "2026-06-14",
      status: "planned",
    });

    expect(result).toEqual({
      ok: true,
      data: {
        milestone: {
          id: "milestone-3",
          title: "Public launch",
          description: "Make the roadmap public.",
          targetDate: "2026-06-14",
          status: "planned",
          position: 3,
          createdAt: "2026-04-23T08:00:00.000Z",
          updatedAt: "2026-04-23T08:00:00.000Z",
        },
      },
    });
    expect(dbMock.roadmapMilestone.create).toHaveBeenCalledWith({
      data: {
        projectId: "project-1",
        title: "Public launch",
        description: "Make the roadmap public.",
        targetDate: new Date("2026-06-14T00:00:00.000Z"),
        status: "planned",
        position: 3,
      },
      select: {
        id: true,
      },
    });
  });

  test("rejects invalid roadmap milestone status input", async () => {
    const result = await createProjectRoadmapMilestone({
      actorUserId: "user-1",
      projectId: "project-1",
      title: "Roadmap item",
      status: "unknown",
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "roadmap-status-invalid",
    });
    expect(dbMock.roadmapMilestone.create).not.toHaveBeenCalled();
  });

  test("reorder validation rejects duplicate ids", () => {
    expect(
      isValidRoadmapReorderPayload({
        milestoneIds: ["m1", "m1"],
      })
    ).toBe(false);
  });

  test("reorder validation rejects ids with surrounding whitespace", () => {
    expect(
      isValidRoadmapReorderPayload({
        milestoneIds: ["m1", " m2 "],
      })
    ).toBe(false);
  });

  test("returns 400 when reorder payload includes ids outside the project", async () => {
    dbMock.roadmapMilestone.findMany.mockResolvedValueOnce([{ id: "milestone-1" }]);

    const result = await reorderProjectRoadmapMilestones({
      actorUserId: "user-1",
      projectId: "project-1",
      milestoneIds: ["milestone-1", "milestone-2"],
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "roadmap-milestones-invalid",
    });
  });
});
