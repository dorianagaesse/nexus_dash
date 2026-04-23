import { beforeEach, describe, expect, test, vi } from "vitest";

const apiGuardMock = vi.hoisted(() => ({
  requireAuthenticatedApiUser: vi.fn(),
}));

const roadmapServiceMock = vi.hoisted(() => ({
  listProjectRoadmapMilestones: vi.fn(),
  createProjectRoadmapMilestone: vi.fn(),
  updateProjectRoadmapMilestone: vi.fn(),
  deleteProjectRoadmapMilestone: vi.fn(),
  reorderProjectRoadmapMilestones: vi.fn(),
  isValidRoadmapReorderPayload: vi.fn(),
}));

vi.mock("@/lib/auth/api-guard", () => ({
  requireAuthenticatedApiUser: apiGuardMock.requireAuthenticatedApiUser,
}));

vi.mock("@/lib/services/project-roadmap-service", () => ({
  listProjectRoadmapMilestones: roadmapServiceMock.listProjectRoadmapMilestones,
  createProjectRoadmapMilestone: roadmapServiceMock.createProjectRoadmapMilestone,
  updateProjectRoadmapMilestone: roadmapServiceMock.updateProjectRoadmapMilestone,
  deleteProjectRoadmapMilestone: roadmapServiceMock.deleteProjectRoadmapMilestone,
  reorderProjectRoadmapMilestones: roadmapServiceMock.reorderProjectRoadmapMilestones,
  isValidRoadmapReorderPayload: roadmapServiceMock.isValidRoadmapReorderPayload,
}));

import {
  GET as getRoadmapMilestones,
  POST as createRoadmapMilestone,
} from "@/app/api/projects/[projectId]/roadmap-milestones/route";
import {
  DELETE as deleteRoadmapMilestone,
  PATCH as updateRoadmapMilestone,
} from "@/app/api/projects/[projectId]/roadmap-milestones/[milestoneId]/route";
import { POST as reorderRoadmapMilestones } from "@/app/api/projects/[projectId]/roadmap-milestones/reorder/route";

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

function projectParams(projectId: string) {
  return { params: Promise.resolve({ projectId }) };
}

function milestoneParams(projectId: string, milestoneId: string) {
  return { params: Promise.resolve({ projectId, milestoneId }) };
}

describe("project roadmap routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiGuardMock.requireAuthenticatedApiUser.mockResolvedValue({
      ok: true,
      userId: "user-1",
    });
    roadmapServiceMock.isValidRoadmapReorderPayload.mockReturnValue(true);
  });

  test("GET /api/projects/:projectId/roadmap-milestones returns serialized milestones", async () => {
    roadmapServiceMock.listProjectRoadmapMilestones.mockResolvedValueOnce([
      {
        id: "milestone-1",
        title: "Private beta",
        description: "Open beta wave one.",
        targetDate: "2026-05-02",
        status: "active",
        position: 0,
        createdAt: "2026-04-23T08:00:00.000Z",
        updatedAt: "2026-04-23T08:00:00.000Z",
      },
    ]);

    const response = await getRoadmapMilestones(
      new Request("http://localhost/api/projects/p1/roadmap-milestones") as never,
      projectParams("p1")
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({
      milestones: [
        {
          id: "milestone-1",
          title: "Private beta",
          description: "Open beta wave one.",
          targetDate: "2026-05-02",
          status: "active",
          position: 0,
          createdAt: "2026-04-23T08:00:00.000Z",
          updatedAt: "2026-04-23T08:00:00.000Z",
        },
      ],
    });
    expect(roadmapServiceMock.listProjectRoadmapMilestones).toHaveBeenCalledWith(
      "p1",
      "user-1"
    );
  });

  test("POST /api/projects/:projectId/roadmap-milestones returns 400 for invalid json", async () => {
    const response = await createRoadmapMilestone(
      new Request("http://localhost/api/projects/p1/roadmap-milestones", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: "{",
      }) as never,
      projectParams("p1")
    );

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({
      error: "invalid-json",
    });
  });

  test("POST /api/projects/:projectId/roadmap-milestones creates a milestone", async () => {
    roadmapServiceMock.createProjectRoadmapMilestone.mockResolvedValueOnce({
      ok: true,
      data: {
        milestone: {
          id: "milestone-1",
          title: "Launch",
          description: null,
          targetDate: "2026-06-14",
          status: "planned",
          position: 0,
          createdAt: "2026-04-23T08:00:00.000Z",
          updatedAt: "2026-04-23T08:00:00.000Z",
        },
      },
    });

    const response = await createRoadmapMilestone(
      new Request("http://localhost/api/projects/p1/roadmap-milestones", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          title: "Launch",
          targetDate: "2026-06-14",
          status: "planned",
        }),
      }) as never,
      projectParams("p1")
    );

    expect(response.status).toBe(201);
    await expect(readJson(response)).resolves.toEqual({
      milestone: {
        id: "milestone-1",
        title: "Launch",
        description: null,
        targetDate: "2026-06-14",
        status: "planned",
        position: 0,
        createdAt: "2026-04-23T08:00:00.000Z",
        updatedAt: "2026-04-23T08:00:00.000Z",
      },
    });
  });

  test("PATCH /api/projects/:projectId/roadmap-milestones/:milestoneId updates a milestone", async () => {
    roadmapServiceMock.updateProjectRoadmapMilestone.mockResolvedValueOnce({
      ok: true,
      data: {
        milestone: {
          id: "milestone-1",
          title: "Launch",
          description: "Refined note",
          targetDate: "2026-06-14",
          status: "active",
          position: 0,
          createdAt: "2026-04-23T08:00:00.000Z",
          updatedAt: "2026-04-23T09:00:00.000Z",
        },
      },
    });

    const response = await updateRoadmapMilestone(
      new Request("http://localhost/api/projects/p1/roadmap-milestones/m1", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          title: "Launch",
          description: "Refined note",
          status: "active",
        }),
      }) as never,
      milestoneParams("p1", "m1")
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({
      milestone: {
        id: "milestone-1",
        title: "Launch",
        description: "Refined note",
        targetDate: "2026-06-14",
        status: "active",
        position: 0,
        createdAt: "2026-04-23T08:00:00.000Z",
        updatedAt: "2026-04-23T09:00:00.000Z",
      },
    });
  });

  test("DELETE /api/projects/:projectId/roadmap-milestones/:milestoneId deletes a milestone", async () => {
    roadmapServiceMock.deleteProjectRoadmapMilestone.mockResolvedValueOnce({
      ok: true,
      data: {
        ok: true,
      },
    });

    const response = await deleteRoadmapMilestone(
      new Request("http://localhost/api/projects/p1/roadmap-milestones/m1", {
        method: "DELETE",
      }) as never,
      milestoneParams("p1", "m1")
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({ ok: true });
  });

  test("POST /api/projects/:projectId/roadmap-milestones/reorder returns 400 for invalid payload", async () => {
    roadmapServiceMock.isValidRoadmapReorderPayload.mockReturnValueOnce(false);

    const response = await reorderRoadmapMilestones(
      new Request("http://localhost/api/projects/p1/roadmap-milestones/reorder", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          milestoneIds: ["m1", "m1"],
        }),
      }) as never,
      projectParams("p1")
    );

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({
      error: "invalid-payload",
    });
  });

  test("POST /api/projects/:projectId/roadmap-milestones/reorder saves ordering", async () => {
    roadmapServiceMock.reorderProjectRoadmapMilestones.mockResolvedValueOnce({
      ok: true,
      data: {
        ok: true,
      },
    });

    const response = await reorderRoadmapMilestones(
      new Request("http://localhost/api/projects/p1/roadmap-milestones/reorder", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          milestoneIds: ["m1", "m2"],
        }),
      }) as never,
      projectParams("p1")
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({ ok: true });
    expect(roadmapServiceMock.reorderProjectRoadmapMilestones).toHaveBeenCalledWith({
      actorUserId: "user-1",
      projectId: "p1",
      milestoneIds: ["m1", "m2"],
    });
  });
});
