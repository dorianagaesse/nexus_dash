import { beforeEach, describe, expect, test, vi } from "vitest";

const apiGuardMock = vi.hoisted(() => ({
  requireAuthenticatedApiUser: vi.fn(),
}));

const collaborationServiceMock = vi.hoisted(() => ({
  removeProjectMember: vi.fn(),
  updateProjectMemberRole: vi.fn(),
}));

vi.mock("@/lib/auth/api-guard", () => ({
  requireAuthenticatedApiUser: apiGuardMock.requireAuthenticatedApiUser,
}));

vi.mock("@/lib/services/project-collaboration-service", () => ({
  removeProjectMember: collaborationServiceMock.removeProjectMember,
  updateProjectMemberRole: collaborationServiceMock.updateProjectMemberRole,
}));

vi.mock("@/lib/services/project-offboarding-service", () => ({
  parseResponsibilityResolution: (value: unknown) => value,
}));

vi.mock("@/lib/observability/logger", () => ({
  logServerWarning: vi.fn(),
}));

import { DELETE } from "@/app/api/projects/[projectId]/sharing/members/[membershipId]/route";

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("project member offboarding route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiGuardMock.requireAuthenticatedApiUser.mockResolvedValue({
      ok: true,
      userId: "owner-1",
    });
  });

  test("DELETE forwards the explicit responsibility resolution", async () => {
    collaborationServiceMock.removeProjectMember.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { ok: true },
    });
    const responsibilityResolution = {
      mode: "unassign",
    };
    const request = new Request(
      "http://localhost/api/projects/project-1/sharing/members/membership-2",
      {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ responsibilityResolution }),
      }
    );

    const response = await DELETE(request as never, {
      params: Promise.resolve({
        projectId: "project-1",
        membershipId: "membership-2",
      }),
    });

    expect(response.status).toBe(200);
    expect(collaborationServiceMock.removeProjectMember).toHaveBeenCalledWith({
      actorUserId: "owner-1",
      projectId: "project-1",
      membershipId: "membership-2",
      responsibilityResolution,
    });
  });

  test("DELETE returns the server-recomputed inventory on conflict", async () => {
    const inventory = {
      taskAssignments: 1,
      contextCardStewardships: 0,
      meetingNoteStewardships: 0,
      meetingTodoAssignments: 0,
      total: 1,
    };
    collaborationServiceMock.removeProjectMember.mockResolvedValueOnce({
      ok: false,
      status: 409,
      error: "responsibility-resolution-required",
      inventory,
    });
    const request = new Request(
      "http://localhost/api/projects/project-1/sharing/members/membership-2",
      { method: "DELETE" }
    );

    const response = await DELETE(request as never, {
      params: Promise.resolve({
        projectId: "project-1",
        membershipId: "membership-2",
      }),
    });

    expect(response.status).toBe(409);
    await expect(readJson(response)).resolves.toEqual({
      error: "responsibility-resolution-required",
      inventory,
    });
  });
});
