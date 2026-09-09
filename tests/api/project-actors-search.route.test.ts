import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const apiGuardMock = vi.hoisted(() => ({
  getAgentProjectAccessContext: vi.fn(),
  requireApiPrincipal: vi.fn(),
}));

const actorServiceMock = vi.hoisted(() => ({
  searchProjectActors: vi.fn(),
}));

vi.mock("@/lib/auth/api-guard", () => ({
  getAgentProjectAccessContext: apiGuardMock.getAgentProjectAccessContext,
  requireApiPrincipal: apiGuardMock.requireApiPrincipal,
}));

vi.mock("@/lib/services/project-actor-service", () => ({
  searchProjectActors: actorServiceMock.searchProjectActors,
}));

import { GET } from "@/app/api/projects/[projectId]/actors/search/route";

describe("project actor search route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiGuardMock.requireApiPrincipal.mockResolvedValue({
      ok: true,
      principal: { kind: "human", actorUserId: "user-1", requestId: "request-1" },
    });
    apiGuardMock.getAgentProjectAccessContext.mockReturnValue(undefined);
  });

  test("returns authentication failures without searching", async () => {
    apiGuardMock.requireApiPrincipal.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    });

    const response = await GET(
      new NextRequest("http://localhost/api/projects/project-1/actors/search"),
      { params: Promise.resolve({ projectId: "project-1" }) }
    );

    expect(response.status).toBe(401);
    expect(actorServiceMock.searchProjectActors).not.toHaveBeenCalled();
  });

  test("passes the query and project-scoped agent context to the service", async () => {
    const agentAccess = {
      credentialId: "credential-1",
      projectId: "project-1",
      scopes: ["task:read"],
    };
    apiGuardMock.requireApiPrincipal.mockResolvedValueOnce({
      ok: true,
      principal: { kind: "agent", actorUserId: "owner-1", requestId: "request-2" },
    });
    apiGuardMock.getAgentProjectAccessContext.mockReturnValueOnce(agentAccess);
    actorServiceMock.searchProjectActors.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { actors: [{ kind: "agent", id: "credential-1" }] },
    });

    const response = await GET(
      new NextRequest(
        "http://localhost/api/projects/project-1/actors/search?query=release"
      ),
      { params: Promise.resolve({ projectId: "project-1" }) }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      actors: [{ kind: "agent", id: "credential-1" }],
    });
    expect(actorServiceMock.searchProjectActors).toHaveBeenCalledWith({
      actorUserId: "owner-1",
      agentAccess,
      projectId: "project-1",
      query: "release",
    });
  });
});
