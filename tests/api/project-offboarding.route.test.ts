import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const apiGuardMock = vi.hoisted(() => ({
  requireAuthenticatedApiUser: vi.fn(),
}));

const offboardingServiceMock = vi.hoisted(() => ({
  getProjectResponsibilityInventory: vi.fn(),
  transferProjectOwnership: vi.fn(),
}));

vi.mock("@/lib/auth/api-guard", () => ({
  requireAuthenticatedApiUser: apiGuardMock.requireAuthenticatedApiUser,
}));

vi.mock("@/lib/services/project-offboarding-service", () => ({
  getProjectResponsibilityInventory:
    offboardingServiceMock.getProjectResponsibilityInventory,
  isOffboardingActorKind: (value: unknown) =>
    value === "human" || value === "agent",
  parseResponsibilityResolution: (value: unknown) => value,
  transferProjectOwnership: offboardingServiceMock.transferProjectOwnership,
}));

vi.mock("@/lib/observability/logger", () => ({
  logServerWarning: vi.fn(),
}));

import { GET } from "@/app/api/projects/[projectId]/offboarding/route";
import { POST } from "@/app/api/projects/[projectId]/ownership/transfer/route";

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("project offboarding routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiGuardMock.requireAuthenticatedApiUser.mockResolvedValue({
      ok: true,
      userId: "owner-1",
    });
  });

  test("GET validates the actor kind", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost/api/projects/project-1/offboarding?actorKind=participant&actorId=user-2"
      ),
      { params: Promise.resolve({ projectId: "project-1" }) }
    );

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({
      error: "invalid-actor-kind",
    });
    expect(
      offboardingServiceMock.getProjectResponsibilityInventory
    ).not.toHaveBeenCalled();
  });

  test("GET returns the current responsibility inventory", async () => {
    const inventory = {
      taskAssignments: 1,
      contextCardStewardships: 2,
      meetingNoteStewardships: 3,
      meetingTodoAssignments: 4,
      total: 10,
    };
    offboardingServiceMock.getProjectResponsibilityInventory.mockResolvedValueOnce(
      {
        ok: true,
        status: 200,
        data: { inventory },
      }
    );

    const response = await GET(
      new NextRequest(
        "http://localhost/api/projects/project-1/offboarding?actorKind=agent&actorId=credential-1"
      ),
      { params: Promise.resolve({ projectId: "project-1" }) }
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({ inventory });
    expect(
      offboardingServiceMock.getProjectResponsibilityInventory
    ).toHaveBeenCalledWith({
      actorUserId: "owner-1",
      projectId: "project-1",
      actorKind: "agent",
      actorId: "credential-1",
    });
  });

  test("POST forwards the atomic transfer and leave choices", async () => {
    offboardingServiceMock.transferProjectOwnership.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        projectId: "project-1",
        newOwnerUserId: "user-2",
        previousOwnerLeft: true,
      },
    });
    const responsibilityResolution = {
      mode: "reassign",
      replacementUserId: "user-2",
    };

    const response = await POST(
      new Request(
        "http://localhost/api/projects/project-1/ownership/transfer",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            newOwnerMembershipId: "membership-2",
            previousOwnerLeaves: true,
            responsibilityResolution,
          }),
        }
      ) as never,
      { params: Promise.resolve({ projectId: "project-1" }) }
    );

    expect(response.status).toBe(200);
    expect(
      offboardingServiceMock.transferProjectOwnership
    ).toHaveBeenCalledWith({
      actorUserId: "owner-1",
      projectId: "project-1",
      newOwnerMembershipId: "membership-2",
      previousOwnerLeaves: true,
      responsibilityResolution,
    });
  });

  test("POST returns a recomputed inventory after a stale choice", async () => {
    const inventory = {
      taskAssignments: 0,
      contextCardStewardships: 1,
      meetingNoteStewardships: 0,
      meetingTodoAssignments: 0,
      total: 1,
    };
    offboardingServiceMock.transferProjectOwnership.mockResolvedValueOnce({
      ok: false,
      status: 409,
      error: "responsibility-resolution-required",
      inventory,
    });

    const response = await POST(
      new Request(
        "http://localhost/api/projects/project-1/ownership/transfer",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            newOwnerMembershipId: "membership-2",
            previousOwnerLeaves: true,
          }),
        }
      ) as never,
      { params: Promise.resolve({ projectId: "project-1" }) }
    );

    expect(response.status).toBe(409);
    await expect(readJson(response)).resolves.toEqual({
      error: "responsibility-resolution-required",
      inventory,
    });
  });
});
