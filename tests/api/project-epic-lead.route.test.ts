import { beforeEach, describe, expect, test, vi } from "vitest";

const apiGuardMock = vi.hoisted(() => ({
  getAgentProjectAccessContext: vi.fn(),
  requireApiPrincipal: vi.fn(),
}));

const projectEpicServiceMock = vi.hoisted(() => ({
  assignProjectEpicLead: vi.fn(),
}));

vi.mock("@/lib/auth/api-guard", () => ({
  getAgentProjectAccessContext: apiGuardMock.getAgentProjectAccessContext,
  requireApiPrincipal: apiGuardMock.requireApiPrincipal,
}));

vi.mock("@/lib/services/project-epic-service", () => ({
  assignProjectEpicLead: projectEpicServiceMock.assignProjectEpicLead,
}));

const activityEventResponseMock = vi.hoisted(() => ({
  recordProjectActivityEventVersion: vi.fn(),
}));

vi.mock("@/lib/project-activity-event-response", () => ({
  recordProjectActivityEventVersion:
    activityEventResponseMock.recordProjectActivityEventVersion,
}));

import { PATCH as assignLead } from "@/app/api/projects/[projectId]/epics/[epicId]/lead/route";
import { PROJECT_ACTIVITY_VERSION_HEADER } from "@/lib/project-activity-version";

const humanActorSummary = {
  kind: "human",
  id: "user-1",
  displayName: "dorian",
  usernameTag: "dorian#0001",
  avatarSeed: "seed-1",
  status: "active",
  isAssignable: true,
};

const agentActorSummary = {
  kind: "agent",
  id: "cred-1",
  displayName: "Release Agent",
  usernameTag: null,
  avatarSeed: null,
  status: "active",
  isAssignable: true,
};

function epicParams(projectId: string, epicId: string) {
  return { params: Promise.resolve({ projectId, epicId }) };
}

function epicFixture(lead: typeof humanActorSummary) {
  return {
    id: "epic-1",
    name: "Workspace launch",
    description: "Deliver the first launch slice.",
    status: "In progress" as const,
    progressPercent: 25,
    taskCount: 4,
    completedTaskCount: 1,
    linkedTasks: [],
    archivedAt: null,
    createdAt: new Date("2026-04-20T08:00:00.000Z"),
    updatedAt: new Date("2026-04-22T10:00:00.000Z"),
    lead,
    leadAssignedAt: new Date("2026-04-22T10:00:00.000Z"),
  };
}

describe("project epic lead route", () => {
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
    activityEventResponseMock.recordProjectActivityEventVersion.mockResolvedValue(
      new Date("2026-10-01T12:00:00.000Z")
    );
  });

  test("PATCH reassigns the lead and records the lead change", async () => {
    projectEpicServiceMock.assignProjectEpicLead.mockResolvedValueOnce({
      ok: true,
      data: {
        epic: epicFixture(agentActorSummary),
        leadChange: {
          previous: humanActorSummary,
          next: agentActorSummary,
        },
        actor: humanActorSummary,
      },
    });

    const response = await assignLead(
      new Request("http://localhost/api/projects/p1/epics/epic-1/lead", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ lead: { kind: "agent", id: " cred-1 " } }),
      }) as never,
      epicParams("p1", "epic-1")
    );

    expect(response.status).toBe(200);
    expect(response.headers.get(PROJECT_ACTIVITY_VERSION_HEADER)).toBe(
      "2026-10-01T12:00:00.000Z"
    );
    const payload = (await response.json()) as {
      epic: { lead: { id: string } };
    };
    expect(payload.epic.lead.id).toBe("cred-1");
    expect(projectEpicServiceMock.assignProjectEpicLead).toHaveBeenCalledWith({
      actorUserId: "user-1",
      projectId: "p1",
      epicId: "epic-1",
      lead: { kind: "agent", id: "cred-1" },
      agentAccess: undefined,
    });
    expect(
      activityEventResponseMock.recordProjectActivityEventVersion
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "p1",
        domain: "epic",
        action: "updated",
        entityId: "epic-1",
        payload: expect.objectContaining({
          leadChange: {
            previous: {
              kind: "human",
              id: "user-1",
              displayName: "dorian",
            },
            next: {
              kind: "agent",
              id: "cred-1",
              displayName: "Release Agent",
            },
          },
        }),
      })
    );
  });

  test("PATCH with an unchanged lead skips the activity event", async () => {
    projectEpicServiceMock.assignProjectEpicLead.mockResolvedValueOnce({
      ok: true,
      data: {
        epic: epicFixture(humanActorSummary),
        leadChange: null,
        actor: humanActorSummary,
      },
    });

    const response = await assignLead(
      new Request("http://localhost/api/projects/p1/epics/epic-1/lead", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ lead: { kind: "human", id: "user-1" } }),
      }) as never,
      epicParams("p1", "epic-1")
    );

    expect(response.status).toBe(200);
    expect(
      activityEventResponseMock.recordProjectActivityEventVersion
    ).not.toHaveBeenCalled();
    expect(response.headers.get(PROJECT_ACTIVITY_VERSION_HEADER)).not.toBeNull();
  });

  test("PATCH forwards service failures", async () => {
    projectEpicServiceMock.assignProjectEpicLead.mockResolvedValueOnce({
      ok: false,
      status: 400,
      error: "epic-lead-invalid",
    });

    const response = await assignLead(
      new Request("http://localhost/api/projects/p1/epics/epic-1/lead", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ lead: { kind: "human", id: "user-gone" } }),
      }) as never,
      epicParams("p1", "epic-1")
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "epic-lead-invalid",
    });
  });

  test("PATCH rejects a malformed lead reference", async () => {
    const response = await assignLead(
      new Request("http://localhost/api/projects/p1/epics/epic-1/lead", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ lead: { kind: "robot", id: "nope" } }),
      }) as never,
      epicParams("p1", "epic-1")
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "epic-lead-invalid",
    });
    expect(projectEpicServiceMock.assignProjectEpicLead).not.toHaveBeenCalled();
  });

  test("PATCH rejects a missing lead", async () => {
    const response = await assignLead(
      new Request("http://localhost/api/projects/p1/epics/epic-1/lead", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      }) as never,
      epicParams("p1", "epic-1")
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "epic-lead-required",
    });
    expect(projectEpicServiceMock.assignProjectEpicLead).not.toHaveBeenCalled();
  });

  test("PATCH rejects invalid json", async () => {
    const response = await assignLead(
      new Request("http://localhost/api/projects/p1/epics/epic-1/lead", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: "{",
      }) as never,
      epicParams("p1", "epic-1")
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid-json" });
    expect(projectEpicServiceMock.assignProjectEpicLead).not.toHaveBeenCalled();
  });
});
