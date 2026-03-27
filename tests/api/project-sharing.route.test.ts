import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const apiGuardMock = vi.hoisted(() => ({
  requireAuthenticatedApiUser: vi.fn(),
}));

const collaborationServiceMock = vi.hoisted(() => ({
  getProjectSharingSummary: vi.fn(),
  inviteUserToProject: vi.fn(),
}));

const logServerWarningMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/api-guard", () => ({
  requireAuthenticatedApiUser: apiGuardMock.requireAuthenticatedApiUser,
}));

vi.mock("@/lib/observability/logger", () => ({
  logServerWarning: logServerWarningMock,
}));

vi.mock("@/lib/services/project-collaboration-service", () => ({
  getProjectSharingSummary: collaborationServiceMock.getProjectSharingSummary,
  inviteUserToProject: collaborationServiceMock.inviteUserToProject,
}));

import { GET, POST } from "@/app/api/projects/[projectId]/sharing/route";

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("project sharing route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiGuardMock.requireAuthenticatedApiUser.mockResolvedValue({
      ok: true,
      userId: "user-1",
    });
  });

  test("GET returns auth failure response when request is unauthenticated", async () => {
    apiGuardMock.requireAuthenticatedApiUser.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    });

    const response = await GET(
      new NextRequest("http://localhost/api/projects/project-1/sharing"),
      { params: { projectId: "project-1" } }
    );

    expect(response.status).toBe(401);
    await expect(readJson(response)).resolves.toEqual({ error: "unauthorized" });
    expect(collaborationServiceMock.getProjectSharingSummary).not.toHaveBeenCalled();
  });

  test("GET returns sharing summary from the collaboration service", async () => {
    collaborationServiceMock.getProjectSharingSummary.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        projectId: "project-1",
        members: [],
        pendingInvitations: [],
      },
    });

    const response = await GET(
      new NextRequest("http://localhost/api/projects/project-1/sharing"),
      { params: { projectId: "project-1" } }
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({
      projectId: "project-1",
      members: [],
      pendingInvitations: [],
    });
    expect(collaborationServiceMock.getProjectSharingSummary).toHaveBeenCalledWith({
      actorUserId: "user-1",
      projectId: "project-1",
    });
  });

  test("POST validates invalid json payloads", async () => {
    const request = new NextRequest("http://localhost/api/projects/project-1/sharing", {
      method: "POST",
      body: "{",
      headers: { "content-type": "application/json" },
    });

    const response = await POST(request, { params: { projectId: "project-1" } });

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({ error: "invalid-json" });
    expect(logServerWarningMock).toHaveBeenCalled();
    expect(collaborationServiceMock.inviteUserToProject).not.toHaveBeenCalled();
  });

  test("POST forwards invite payload to the collaboration service", async () => {
    collaborationServiceMock.inviteUserToProject.mockResolvedValueOnce({
      ok: true,
      status: 201,
      data: {
        invitation: {
          invitationId: "invite-1",
        },
      },
    });

    const response = await POST(
      new NextRequest("http://localhost/api/projects/project-1/sharing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          invitedEmail: "user2@example.com",
          role: "viewer",
        }),
      }),
      { params: { projectId: "project-1" } }
    );

    expect(response.status).toBe(201);
    await expect(readJson(response)).resolves.toEqual({
      invitation: {
        invitationId: "invite-1",
      },
    });
    expect(collaborationServiceMock.inviteUserToProject).toHaveBeenCalledWith({
      actorUserId: "user-1",
      projectId: "project-1",
      invitedEmail: "user2@example.com",
      role: "viewer",
    });
  });
});
