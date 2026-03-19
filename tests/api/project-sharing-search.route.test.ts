import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const apiGuardMock = vi.hoisted(() => ({
  requireAuthenticatedApiUser: vi.fn(),
}));

const collaborationServiceMock = vi.hoisted(() => ({
  searchInvitableUsersForProject: vi.fn(),
}));

vi.mock("@/lib/auth/api-guard", () => ({
  requireAuthenticatedApiUser: apiGuardMock.requireAuthenticatedApiUser,
}));

vi.mock("@/lib/services/project-collaboration-service", () => ({
  searchInvitableUsersForProject:
    collaborationServiceMock.searchInvitableUsersForProject,
}));

import { GET } from "@/app/api/projects/[projectId]/sharing/search/route";

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("project sharing search route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiGuardMock.requireAuthenticatedApiUser.mockResolvedValue({
      ok: true,
      userId: "owner-1",
    });
  });

  test("returns auth failure response when request is unauthenticated", async () => {
    apiGuardMock.requireAuthenticatedApiUser.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    });

    const response = await GET(
      new NextRequest("http://localhost/api/projects/project-1/sharing/search?query=jo"),
      { params: { projectId: "project-1" } }
    );

    expect(response.status).toBe(401);
    await expect(readJson(response)).resolves.toEqual({ error: "unauthorized" });
    expect(collaborationServiceMock.searchInvitableUsersForProject).not.toHaveBeenCalled();
  });

  test("normalizes a missing search query to an empty string", async () => {
    collaborationServiceMock.searchInvitableUsersForProject.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        users: [],
      },
    });

    const response = await GET(
      new NextRequest("http://localhost/api/projects/project-1/sharing/search"),
      { params: { projectId: "project-1" } }
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({ users: [] });
    expect(collaborationServiceMock.searchInvitableUsersForProject).toHaveBeenCalledWith({
      actorUserId: "owner-1",
      projectId: "project-1",
      query: "",
    });
  });
});
