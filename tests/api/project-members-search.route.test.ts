import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const apiGuardMock = vi.hoisted(() => ({
  getAgentProjectAccessContext: vi.fn(),
  requireApiPrincipal: vi.fn(),
}));

const collaborationServiceMock = vi.hoisted(() => ({
  searchProjectMembersForMention: vi.fn(),
}));

vi.mock("@/lib/auth/api-guard", () => ({
  getAgentProjectAccessContext: apiGuardMock.getAgentProjectAccessContext,
  requireApiPrincipal: apiGuardMock.requireApiPrincipal,
}));

vi.mock("@/lib/services/project-collaboration-service", () => ({
  searchProjectMembersForMention:
    collaborationServiceMock.searchProjectMembersForMention,
}));

import { GET } from "@/app/api/projects/[projectId]/members/search/route";

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("project member mention search route", () => {
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
  });

  test("returns auth failure response when request is unauthenticated", async () => {
    apiGuardMock.requireApiPrincipal.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    });

    const response = await GET(
      new NextRequest("http://localhost/api/projects/project-1/members/search?query=do"),
      { params: Promise.resolve({ projectId: "project-1" }) }
    );

    expect(response.status).toBe(401);
    await expect(readJson(response)).resolves.toEqual({ error: "unauthorized" });
    expect(collaborationServiceMock.searchProjectMembersForMention).not.toHaveBeenCalled();
  });

  test("passes agent project access context through to member search", async () => {
    const agentAccess = {
      credentialId: "credential-1",
      projectId: "project-1",
      scopes: ["task:write"],
    };
    apiGuardMock.requireApiPrincipal.mockResolvedValueOnce({
      ok: true,
      principal: {
        kind: "agent",
        actorUserId: "owner-1",
        requestId: "request-2",
      },
    });
    apiGuardMock.getAgentProjectAccessContext.mockReturnValueOnce(agentAccess);
    collaborationServiceMock.searchProjectMembersForMention.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        members: [],
      },
    });

    const response = await GET(
      new NextRequest("http://localhost/api/projects/project-1/members/search?query=do"),
      { params: Promise.resolve({ projectId: "project-1" }) }
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({ members: [] });
    expect(collaborationServiceMock.searchProjectMembersForMention).toHaveBeenCalledWith({
      actorUserId: "owner-1",
      agentAccess,
      projectId: "project-1",
      query: "do",
    });
  });
});
