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
  roadmapPhase: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    aggregate: vi.fn(),
  },
  roadmapEvent: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    aggregate: vi.fn(),
  },
  $transaction: vi.fn(),
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
  createProjectRoadmapEvent,
  createProjectRoadmapPhase,
  isValidRoadmapEventMovePayload,
  isValidRoadmapPhaseReorderPayload,
  listProjectRoadmapPhases,
  moveProjectRoadmapEvent,
  reorderProjectRoadmapPhases,
} from "@/lib/services/project-roadmap-service";

describe("project-roadmap-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    projectAccessServiceMock.requireProjectRole.mockResolvedValue({
      ok: true,
      role: "owner",
    });
    rlsContextMock.withActorRlsContext.mockImplementation(
      async (_actorUserId: string, operation: (db: typeof dbMock) => unknown) => operation(dbMock)
    );
    dbMock.$transaction.mockImplementation(async (operations: Promise<unknown>[]) =>
      Promise.all(operations)
    );
  });

  test("lists roadmap phases with nested events for viewers", async () => {
    dbMock.roadmapPhase.findMany.mockResolvedValueOnce([
      {
        id: "phase-1",
        title: "Private beta",
        description: "Invite the first cohort.",
        targetDate: new Date("2026-05-02T00:00:00.000Z"),
        status: "active",
        position: 0,
        createdAt: new Date("2026-04-20T08:00:00.000Z"),
        updatedAt: new Date("2026-04-21T09:30:00.000Z"),
        events: [
          {
            id: "event-1",
            phaseId: "phase-1",
            title: "Invite wave one",
            description: "First external testers.",
            targetDate: new Date("2026-05-02T00:00:00.000Z"),
            status: "active",
            position: 0,
            createdAt: new Date("2026-04-20T08:00:00.000Z"),
            updatedAt: new Date("2026-04-21T09:30:00.000Z"),
          },
        ],
      },
    ]);

    const result = await listProjectRoadmapPhases("project-1", "user-1");

    expect(result).toEqual([
      {
        id: "phase-1",
        title: "Private beta",
        description: "Invite the first cohort.",
        targetDate: "2026-05-02",
        status: "active",
        position: 0,
        createdAt: "2026-04-20T08:00:00.000Z",
        updatedAt: "2026-04-21T09:30:00.000Z",
        events: [
          {
            id: "event-1",
            phaseId: "phase-1",
            title: "Invite wave one",
            description: "First external testers.",
            targetDate: "2026-05-02",
            status: "active",
            position: 0,
            createdAt: "2026-04-20T08:00:00.000Z",
            updatedAt: "2026-04-21T09:30:00.000Z",
          },
        ],
      },
    ]);
    expect(projectAccessServiceMock.requireProjectRole).toHaveBeenCalledWith({
      actorUserId: "user-1",
      projectId: "project-1",
      minimumRole: "viewer",
      db: dbMock,
    });
  });

  test("creates roadmap phase with sequential position", async () => {
    dbMock.roadmapPhase.aggregate.mockResolvedValueOnce({
      _max: {
        position: 2,
      },
    });
    dbMock.roadmapPhase.create.mockResolvedValueOnce({
      id: "phase-3",
    });
    dbMock.roadmapPhase.findFirst.mockResolvedValueOnce({
      id: "phase-3",
      title: "Public launch",
      description: "Open the product publicly.",
      targetDate: new Date("2026-06-14T00:00:00.000Z"),
      status: "planned",
      position: 3,
      createdAt: new Date("2026-04-23T08:00:00.000Z"),
      updatedAt: new Date("2026-04-23T08:00:00.000Z"),
      events: [],
    });

    const result = await createProjectRoadmapPhase({
      actorUserId: "user-1",
      projectId: "project-1",
      title: "Public launch",
      description: "Open the product publicly.",
      targetDate: "2026-06-14",
      status: "planned",
    });

    expect(result).toEqual({
      ok: true,
      data: {
        phase: {
          id: "phase-3",
          title: "Public launch",
          description: "Open the product publicly.",
          targetDate: "2026-06-14",
          status: "planned",
          position: 3,
          createdAt: "2026-04-23T08:00:00.000Z",
          updatedAt: "2026-04-23T08:00:00.000Z",
          events: [],
        },
      },
    });
    expect(dbMock.roadmapPhase.create).toHaveBeenCalledWith({
      data: {
        projectId: "project-1",
        title: "Public launch",
        description: "Open the product publicly.",
        targetDate: new Date("2026-06-14T00:00:00.000Z"),
        status: "planned",
        position: 3,
      },
      select: {
        id: true,
      },
    });
  });

  test("creates roadmap event with phase status fallback", async () => {
    dbMock.roadmapPhase.findFirst.mockResolvedValueOnce({
      id: "phase-1",
      status: "active",
    });
    dbMock.roadmapEvent.aggregate.mockResolvedValueOnce({
      _max: {
        position: 0,
      },
    });
    dbMock.roadmapEvent.create.mockResolvedValueOnce({
      id: "event-2",
    });
    dbMock.roadmapEvent.findFirst.mockResolvedValueOnce({
      id: "event-2",
      phaseId: "phase-1",
      title: "Open docs",
      description: "Publish onboarding docs.",
      targetDate: null,
      status: "active",
      position: 1,
      createdAt: new Date("2026-04-23T08:00:00.000Z"),
      updatedAt: new Date("2026-04-23T08:00:00.000Z"),
    });
    dbMock.roadmapPhase.findFirst.mockResolvedValueOnce({
      id: "phase-1",
      title: "Private beta",
      description: "Invite the first cohort.",
      targetDate: null,
      status: "active",
      position: 0,
      createdAt: new Date("2026-04-23T08:00:00.000Z"),
      updatedAt: new Date("2026-04-23T08:00:00.000Z"),
      events: [
        {
          id: "event-2",
          phaseId: "phase-1",
          title: "Open docs",
          description: "Publish onboarding docs.",
          targetDate: null,
          status: "active",
          position: 1,
          createdAt: new Date("2026-04-23T08:00:00.000Z"),
          updatedAt: new Date("2026-04-23T08:00:00.000Z"),
        },
      ],
    });

    const result = await createProjectRoadmapEvent({
      actorUserId: "user-1",
      projectId: "project-1",
      phaseId: "phase-1",
      title: "Open docs",
      description: "Publish onboarding docs.",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected createProjectRoadmapEvent to succeed");
    }
    expect(result.data.event.status).toBe("active");
    expect(dbMock.roadmapEvent.create).toHaveBeenCalledWith({
      data: {
        projectId: "project-1",
        phaseId: "phase-1",
        title: "Open docs",
        description: "Publish onboarding docs.",
        targetDate: null,
        status: "active",
        position: 1,
      },
      select: {
        id: true,
      },
    });
  });

  test("phase reorder validation rejects duplicate ids", () => {
    expect(
      isValidRoadmapPhaseReorderPayload({
        phaseIds: ["p1", "p1"],
      })
    ).toBe(false);
  });

  test("event move validation rejects non-integer target index", () => {
    expect(
      isValidRoadmapEventMovePayload({
        eventId: "e1",
        targetPhaseId: "p2",
        targetIndex: 1.25,
      })
    ).toBe(false);
  });

  test("returns 400 when phase reorder payload includes ids outside the project", async () => {
    dbMock.roadmapPhase.findMany.mockResolvedValueOnce([{ id: "phase-1" }]);

    const result = await reorderProjectRoadmapPhases({
      actorUserId: "user-1",
      projectId: "project-1",
      phaseIds: ["phase-1", "phase-2"],
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "roadmap-phases-invalid",
    });
  });

  test("moves roadmap event across phases and persists reordered positions", async () => {
    dbMock.roadmapEvent.findFirst.mockResolvedValueOnce({
      id: "event-2",
      phaseId: "phase-1",
    });
    dbMock.roadmapPhase.findFirst.mockResolvedValueOnce({
      id: "phase-2",
    });
    dbMock.roadmapEvent.findMany
      .mockResolvedValueOnce([{ id: "event-1" }, { id: "event-2" }])
      .mockResolvedValueOnce([{ id: "event-3" }]);
    dbMock.roadmapEvent.update.mockResolvedValue({});

    const result = await moveProjectRoadmapEvent({
      actorUserId: "user-1",
      projectId: "project-1",
      eventId: "event-2",
      targetPhaseId: "phase-2",
      targetIndex: 1,
    });

    expect(result).toEqual({
      ok: true,
      data: {
        ok: true,
      },
    });
    expect(dbMock.$transaction).toHaveBeenCalled();
  });
});
