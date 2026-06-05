import { beforeEach, describe, expect, test, vi } from "vitest";

const apiGuardMock = vi.hoisted(() => ({
  getAgentProjectAccessContext: vi.fn(),
  requireApiPrincipal: vi.fn(),
}));

const roadmapServiceMock = vi.hoisted(() => ({
  listProjectRoadmapPhases: vi.fn(),
  createProjectRoadmapPhase: vi.fn(),
  updateProjectRoadmapPhase: vi.fn(),
  deleteProjectRoadmapPhase: vi.fn(),
  createProjectRoadmapEvent: vi.fn(),
  updateProjectRoadmapEvent: vi.fn(),
  deleteProjectRoadmapEvent: vi.fn(),
  reorderProjectRoadmapPhases: vi.fn(),
  reorderProjectRoadmapEvents: vi.fn(),
  moveProjectRoadmapEvent: vi.fn(),
  isValidRoadmapPhaseReorderPayload: vi.fn(),
  isValidRoadmapEventReorderPayload: vi.fn(),
  isValidRoadmapEventMovePayload: vi.fn(),
}));

const projectAccessServiceMock = vi.hoisted(() => ({
  requireAgentProjectScopes: vi.fn(
    (input: {
      agentAccess?: { projectId: string; scopes: string[] };
      projectId: string;
      requiredScopes: string[];
    }) => {
      if (!input.agentAccess) {
        return { ok: true };
      }

      if (input.agentAccess.projectId !== input.projectId) {
        return { ok: false, status: 404, error: "project-not-found" };
      }

      const hasRequiredScopes = input.requiredScopes.every((scope) =>
        input.agentAccess?.scopes.includes(scope)
      );
      if (!hasRequiredScopes) {
        return { ok: false, status: 403, error: "forbidden" };
      }

      return { ok: true };
    }
  ),
}));

vi.mock("@/lib/auth/api-guard", () => ({
  getAgentProjectAccessContext: apiGuardMock.getAgentProjectAccessContext,
  requireApiPrincipal: apiGuardMock.requireApiPrincipal,
}));

vi.mock("@/lib/services/project-access-service", () => ({
  requireAgentProjectScopes: projectAccessServiceMock.requireAgentProjectScopes,
}));

vi.mock("@/lib/services/project-roadmap-service", () => ({
  listProjectRoadmapPhases: roadmapServiceMock.listProjectRoadmapPhases,
  createProjectRoadmapPhase: roadmapServiceMock.createProjectRoadmapPhase,
  updateProjectRoadmapPhase: roadmapServiceMock.updateProjectRoadmapPhase,
  deleteProjectRoadmapPhase: roadmapServiceMock.deleteProjectRoadmapPhase,
  createProjectRoadmapEvent: roadmapServiceMock.createProjectRoadmapEvent,
  updateProjectRoadmapEvent: roadmapServiceMock.updateProjectRoadmapEvent,
  deleteProjectRoadmapEvent: roadmapServiceMock.deleteProjectRoadmapEvent,
  reorderProjectRoadmapPhases: roadmapServiceMock.reorderProjectRoadmapPhases,
  reorderProjectRoadmapEvents: roadmapServiceMock.reorderProjectRoadmapEvents,
  moveProjectRoadmapEvent: roadmapServiceMock.moveProjectRoadmapEvent,
  isValidRoadmapPhaseReorderPayload: roadmapServiceMock.isValidRoadmapPhaseReorderPayload,
  isValidRoadmapEventReorderPayload: roadmapServiceMock.isValidRoadmapEventReorderPayload,
  isValidRoadmapEventMovePayload: roadmapServiceMock.isValidRoadmapEventMovePayload,
}));

import {
  GET as getRoadmap,
  POST as createRoadmapPhase,
} from "@/app/api/projects/[projectId]/roadmap/route";
import {
  DELETE as deleteRoadmapPhase,
  PATCH as updateRoadmapPhase,
} from "@/app/api/projects/[projectId]/roadmap/phases/[phaseId]/route";
import { POST as createRoadmapEvent } from "@/app/api/projects/[projectId]/roadmap/phases/[phaseId]/events/route";
import { POST as reorderRoadmapPhases } from "@/app/api/projects/[projectId]/roadmap/phases/reorder/route";
import {
  DELETE as deleteRoadmapEvent,
  PATCH as updateRoadmapEvent,
} from "@/app/api/projects/[projectId]/roadmap/events/[eventId]/route";
import { POST as reorderRoadmapEvents } from "@/app/api/projects/[projectId]/roadmap/events/reorder/route";
import { POST as moveRoadmapEvent } from "@/app/api/projects/[projectId]/roadmap/events/move/route";

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

function projectParams(projectId: string) {
  return { params: Promise.resolve({ projectId }) };
}

function phaseParams(projectId: string, phaseId: string) {
  return { params: Promise.resolve({ projectId, phaseId }) };
}

function eventParams(projectId: string, eventId: string) {
  return { params: Promise.resolve({ projectId, eventId }) };
}

describe("project roadmap routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiGuardMock.requireApiPrincipal.mockResolvedValue({
      ok: true,
      principal: {
        kind: "human",
        actorUserId: "user-1",
        requestId: "request-1",
      },
    });
    apiGuardMock.getAgentProjectAccessContext.mockReturnValue(undefined);
    roadmapServiceMock.isValidRoadmapPhaseReorderPayload.mockReturnValue(true);
    roadmapServiceMock.isValidRoadmapEventReorderPayload.mockReturnValue(true);
    roadmapServiceMock.isValidRoadmapEventMovePayload.mockReturnValue(true);
  });

  function mockAgentAccess(scopes: string[] = ["roadmap:read", "roadmap:write", "roadmap:delete"]) {
    const agentAccess = {
      projectId: "p1",
      credentialId: "credential-1",
      credentialLabel: "Build bot",
      ownerUserId: "owner-1",
      scopes,
    };

    apiGuardMock.requireApiPrincipal.mockResolvedValueOnce({
      ok: true,
      principal: {
        kind: "agent",
        actorUserId: "owner-1",
        requestId: "request-agent-1",
      },
    });
    apiGuardMock.getAgentProjectAccessContext.mockReturnValueOnce(agentAccess);

    return agentAccess;
  }

  test("GET /api/projects/:projectId/roadmap returns serialized phases", async () => {
    roadmapServiceMock.listProjectRoadmapPhases.mockResolvedValueOnce([
      {
        id: "phase-1",
        title: "Private beta",
        description: "Open beta wave one.",
        targetDate: "2026-05-02",
        status: "active",
        position: 0,
        createdAt: "2026-04-23T08:00:00.000Z",
        updatedAt: "2026-04-23T08:00:00.000Z",
        events: [],
      },
    ]);

    const response = await getRoadmap(
      new Request("http://localhost/api/projects/p1/roadmap") as never,
      projectParams("p1")
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({
      phases: [
        {
          id: "phase-1",
          title: "Private beta",
          description: "Open beta wave one.",
          targetDate: "2026-05-02",
          status: "active",
          position: 0,
          createdAt: "2026-04-23T08:00:00.000Z",
          updatedAt: "2026-04-23T08:00:00.000Z",
          events: [],
        },
      ],
    });
    expect(roadmapServiceMock.listProjectRoadmapPhases).toHaveBeenCalledWith(
      "p1",
      "user-1",
      undefined
    );
  });

  test("GET /api/projects/:projectId/roadmap passes scoped agent access", async () => {
    const agentAccess = mockAgentAccess(["roadmap:read"]);
    roadmapServiceMock.listProjectRoadmapPhases.mockResolvedValueOnce([]);

    const response = await getRoadmap(
      new Request("http://localhost/api/projects/p1/roadmap") as never,
      projectParams("p1")
    );

    expect(response.status).toBe(200);
    expect(roadmapServiceMock.listProjectRoadmapPhases).toHaveBeenCalledWith(
      "p1",
      "owner-1",
      agentAccess
    );
  });

  test("GET /api/projects/:projectId/roadmap rejects agents without roadmap read", async () => {
    mockAgentAccess(["roadmap:write"]);

    const response = await getRoadmap(
      new Request("http://localhost/api/projects/p1/roadmap") as never,
      projectParams("p1")
    );

    expect(response.status).toBe(403);
    await expect(readJson(response)).resolves.toEqual({
      error: "forbidden",
    });
    expect(roadmapServiceMock.listProjectRoadmapPhases).not.toHaveBeenCalled();
  });

  test("GET /api/projects/:projectId/roadmap rejects cross-project agent access", async () => {
    const agentAccess = mockAgentAccess(["roadmap:read"]);
    agentAccess.projectId = "other-project";

    const response = await getRoadmap(
      new Request("http://localhost/api/projects/p1/roadmap") as never,
      projectParams("p1")
    );

    expect(response.status).toBe(404);
    await expect(readJson(response)).resolves.toEqual({
      error: "project-not-found",
    });
    expect(roadmapServiceMock.listProjectRoadmapPhases).not.toHaveBeenCalled();
  });

  test("POST /api/projects/:projectId/roadmap returns 400 for invalid json", async () => {
    const response = await createRoadmapPhase(
      new Request("http://localhost/api/projects/p1/roadmap", {
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

  test("POST /api/projects/:projectId/roadmap creates a phase", async () => {
    roadmapServiceMock.createProjectRoadmapPhase.mockResolvedValueOnce({
      ok: true,
      data: {
        phase: {
          id: "phase-1",
          title: "Launch",
          description: null,
          targetDate: "2026-06-14",
          status: "planned",
          position: 0,
          createdAt: "2026-04-23T08:00:00.000Z",
          updatedAt: "2026-04-23T08:00:00.000Z",
          events: [],
        },
      },
    });

    const response = await createRoadmapPhase(
      new Request("http://localhost/api/projects/p1/roadmap", {
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
      phase: {
        id: "phase-1",
        title: "Launch",
        description: null,
        targetDate: "2026-06-14",
        status: "planned",
        position: 0,
        createdAt: "2026-04-23T08:00:00.000Z",
        updatedAt: "2026-04-23T08:00:00.000Z",
        events: [],
      },
    });
  });

  test("POST /api/projects/:projectId/roadmap passes roadmap write agent access", async () => {
    const agentAccess = mockAgentAccess(["roadmap:write"]);
    roadmapServiceMock.createProjectRoadmapPhase.mockResolvedValueOnce({
      ok: true,
      data: {
        phase: {
          id: "phase-agent",
          title: "Agent phase",
          description: null,
          targetDate: null,
          status: "planned",
          position: 0,
          createdAt: "2026-04-23T08:00:00.000Z",
          updatedAt: "2026-04-23T08:00:00.000Z",
          events: [],
        },
      },
    });

    const response = await createRoadmapPhase(
      new Request("http://localhost/api/projects/p1/roadmap", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ title: "Agent phase" }),
      }) as never,
      projectParams("p1")
    );

    expect(response.status).toBe(201);
    expect(roadmapServiceMock.createProjectRoadmapPhase).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "owner-1",
        projectId: "p1",
        agentAccess,
        title: "Agent phase",
      })
    );
  });

  test("PATCH /api/projects/:projectId/roadmap/phases/:phaseId rejects invalid field types", async () => {
    const response = await updateRoadmapPhase(
      new Request("http://localhost/api/projects/p1/roadmap/phases/phase-1", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          description: 123,
        }),
      }) as never,
      phaseParams("p1", "phase-1")
    );

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({
      error: "invalid-payload",
    });
    expect(roadmapServiceMock.updateProjectRoadmapPhase).not.toHaveBeenCalled();
  });

  test("DELETE /api/projects/:projectId/roadmap/phases/:phaseId deletes a phase", async () => {
    roadmapServiceMock.deleteProjectRoadmapPhase.mockResolvedValueOnce({
      ok: true,
      data: {
        ok: true,
      },
    });

    const response = await deleteRoadmapPhase(
      new Request("http://localhost/api/projects/p1/roadmap/phases/phase-1", {
        method: "DELETE",
      }) as never,
      phaseParams("p1", "phase-1")
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({ ok: true });
    expect(roadmapServiceMock.deleteProjectRoadmapPhase).toHaveBeenCalledWith({
      actorUserId: "user-1",
      projectId: "p1",
      phaseId: "phase-1",
      agentAccess: undefined,
    });
  });

  test("DELETE /api/projects/:projectId/roadmap/phases/:phaseId requires roadmap delete for agents", async () => {
    mockAgentAccess(["roadmap:write"]);

    const response = await deleteRoadmapPhase(
      new Request("http://localhost/api/projects/p1/roadmap/phases/phase-1", {
        method: "DELETE",
      }) as never,
      phaseParams("p1", "phase-1")
    );

    expect(response.status).toBe(403);
    await expect(readJson(response)).resolves.toEqual({
      error: "forbidden",
    });
    expect(roadmapServiceMock.deleteProjectRoadmapPhase).not.toHaveBeenCalled();
  });

  test("POST /api/projects/:projectId/roadmap/phases/:phaseId/events creates an event", async () => {
    roadmapServiceMock.createProjectRoadmapEvent.mockResolvedValueOnce({
      ok: true,
      data: {
        event: {
          id: "event-1",
          phaseId: "phase-1",
          title: "Kickoff",
          description: null,
          targetDate: null,
          status: "planned",
          position: 0,
          createdAt: "2026-04-23T08:00:00.000Z",
          updatedAt: "2026-04-23T08:00:00.000Z",
        },
        phase: {
          id: "phase-1",
          title: "Launch",
          description: null,
          targetDate: null,
          status: "planned",
          position: 0,
          createdAt: "2026-04-23T08:00:00.000Z",
          updatedAt: "2026-04-23T08:00:00.000Z",
          events: [],
        },
      },
    });

    const response = await createRoadmapEvent(
      new Request("http://localhost/api/projects/p1/roadmap/phases/phase-1/events", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          title: "Kickoff",
        }),
      }) as never,
      phaseParams("p1", "phase-1")
    );

    expect(response.status).toBe(201);
    await expect(readJson(response)).resolves.toEqual({
      event: {
        id: "event-1",
        phaseId: "phase-1",
        title: "Kickoff",
        description: null,
        targetDate: null,
        status: "planned",
        position: 0,
        createdAt: "2026-04-23T08:00:00.000Z",
        updatedAt: "2026-04-23T08:00:00.000Z",
      },
      phase: {
        id: "phase-1",
        title: "Launch",
        description: null,
        targetDate: null,
        status: "planned",
        position: 0,
        createdAt: "2026-04-23T08:00:00.000Z",
        updatedAt: "2026-04-23T08:00:00.000Z",
        events: [],
      },
    });
  });

  test("PATCH /api/projects/:projectId/roadmap/events/:eventId rejects invalid field types", async () => {
    const response = await updateRoadmapEvent(
      new Request("http://localhost/api/projects/p1/roadmap/events/event-1", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          description: 123,
        }),
      }) as never,
      eventParams("p1", "event-1")
    );

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({
      error: "invalid-payload",
    });
    expect(roadmapServiceMock.updateProjectRoadmapEvent).not.toHaveBeenCalled();
  });

  test("DELETE /api/projects/:projectId/roadmap/events/:eventId deletes an event", async () => {
    roadmapServiceMock.deleteProjectRoadmapEvent.mockResolvedValueOnce({
      ok: true,
      data: {
        ok: true,
        phaseId: "phase-1",
      },
    });

    const response = await deleteRoadmapEvent(
      new Request("http://localhost/api/projects/p1/roadmap/events/event-1", {
        method: "DELETE",
      }) as never,
      eventParams("p1", "event-1")
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({
      ok: true,
      phaseId: "phase-1",
    });
  });

  test("POST /api/projects/:projectId/roadmap/phases/reorder returns 400 for invalid payload", async () => {
    roadmapServiceMock.isValidRoadmapPhaseReorderPayload.mockReturnValueOnce(false);

    const response = await reorderRoadmapPhases(
      new Request("http://localhost/api/projects/p1/roadmap/phases/reorder", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          phaseIds: ["phase-1", "phase-1"],
        }),
      }) as never,
      projectParams("p1")
    );

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({
      error: "invalid-payload",
    });
  });

  test("POST /api/projects/:projectId/roadmap/phases/reorder saves phase order", async () => {
    roadmapServiceMock.isValidRoadmapPhaseReorderPayload.mockReturnValueOnce(true);
    roadmapServiceMock.reorderProjectRoadmapPhases.mockResolvedValueOnce({
      ok: true,
      data: {
        ok: true,
      },
    });

    const response = await reorderRoadmapPhases(
      new Request("http://localhost/api/projects/p1/roadmap/phases/reorder", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          phaseIds: ["phase-2", "phase-1"],
        }),
      }) as never,
      projectParams("p1")
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({ ok: true });
    expect(roadmapServiceMock.reorderProjectRoadmapPhases).toHaveBeenCalledWith({
      actorUserId: "user-1",
      projectId: "p1",
      agentAccess: undefined,
      phaseIds: ["phase-2", "phase-1"],
    });
  });

  test("POST /api/projects/:projectId/roadmap/events/reorder saves event order", async () => {
    roadmapServiceMock.isValidRoadmapEventReorderPayload.mockReturnValueOnce(true);
    roadmapServiceMock.reorderProjectRoadmapEvents.mockResolvedValueOnce({
      ok: true,
      data: {
        ok: true,
      },
    });

    const response = await reorderRoadmapEvents(
      new Request("http://localhost/api/projects/p1/roadmap/events/reorder", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          phaseId: "phase-1",
          eventIds: ["event-2", "event-1"],
        }),
      }) as never,
      projectParams("p1")
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({ ok: true });
    expect(roadmapServiceMock.reorderProjectRoadmapEvents).toHaveBeenCalledWith({
      actorUserId: "user-1",
      projectId: "p1",
      agentAccess: undefined,
      phaseId: "phase-1",
      eventIds: ["event-2", "event-1"],
    });
  });

  test("POST /api/projects/:projectId/roadmap/events/move saves event move", async () => {
    roadmapServiceMock.moveProjectRoadmapEvent.mockResolvedValueOnce({
      ok: true,
      data: {
        ok: true,
      },
    });

    const response = await moveRoadmapEvent(
      new Request("http://localhost/api/projects/p1/roadmap/events/move", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          eventId: "event-1",
          targetPhaseId: "phase-2",
          targetIndex: 1,
        }),
      }) as never,
      projectParams("p1")
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({ ok: true });
    expect(roadmapServiceMock.moveProjectRoadmapEvent).toHaveBeenCalledWith({
      actorUserId: "user-1",
      projectId: "p1",
      agentAccess: undefined,
      eventId: "event-1",
      targetPhaseId: "phase-2",
      targetIndex: 1,
    });
  });
});
