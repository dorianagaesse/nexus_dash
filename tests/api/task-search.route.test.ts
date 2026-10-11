import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const apiGuardMock = vi.hoisted(() => ({
  requireApiPrincipal: vi.fn(),
  getAgentProjectAccessContext: vi.fn(),
}));
const projectAccessServiceMock = vi.hoisted(() => ({
  requireAgentProjectScopes: vi.fn(),
}));
const taskSearchServiceMock = vi.hoisted(() => ({
  searchProjectTaskIds: vi.fn(),
}));

vi.mock("@/lib/auth/api-guard", () => ({
  requireApiPrincipal: apiGuardMock.requireApiPrincipal,
  getAgentProjectAccessContext: apiGuardMock.getAgentProjectAccessContext,
}));
vi.mock("@/lib/services/project-access-service", () => ({
  requireAgentProjectScopes: projectAccessServiceMock.requireAgentProjectScopes,
}));
vi.mock("@/lib/services/project-task-search-service", () => ({
  searchProjectTaskIds: taskSearchServiceMock.searchProjectTaskIds,
}));

import { GET } from "@/app/api/projects/[projectId]/tasks/search/route";

const agentAccess = {
  credentialId: "credential-1",
  projectId: "project-1",
  scopes: ["task:read"] as const,
};

describe("task search route", () => {
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
    projectAccessServiceMock.requireAgentProjectScopes.mockReturnValue({
      ok: true,
    });
    taskSearchServiceMock.searchProjectTaskIds.mockResolvedValue({
      ok: true,
      data: { taskIds: ["task-1", "task-2"], totalMatches: 2, truncated: false },
    });
  });

  test("returns the bounded search result for human sessions", async () => {
    const request = new NextRequest(
      "http://localhost/api/projects/project-1/tasks/search?q=%20Launch%20"
    );
    const response = await GET(request, {
      params: Promise.resolve({ projectId: "project-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      taskIds: ["task-1", "task-2"],
      totalMatches: 2,
      truncated: false,
    });
    expect(taskSearchServiceMock.searchProjectTaskIds).toHaveBeenCalledWith({
      actorUserId: "user-1",
      projectId: "project-1",
      query: " Launch ",
      agentAccess: undefined,
      limit: null,
    });
  });

  test("rejects missing authentication before search", async () => {
    apiGuardMock.requireApiPrincipal.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    });

    const response = await GET(
      new NextRequest("http://localhost/api/projects/project-1/tasks/search?q=test"),
      { params: Promise.resolve({ projectId: "project-1" }) }
    );

    expect(response.status).toBe(401);
    expect(taskSearchServiceMock.searchProjectTaskIds).not.toHaveBeenCalled();
  });

  test("forwards agent callers with their project access context", async () => {
    apiGuardMock.requireApiPrincipal.mockResolvedValueOnce({
      ok: true,
      principal: {
        kind: "agent",
        actorUserId: "owner-1",
        ownerUserId: "owner-1",
        credentialId: "credential-1",
        projectId: "project-1",
        scopes: ["task:read"],
        tokenId: "token-1",
        requestId: "request-1",
      },
    });
    apiGuardMock.getAgentProjectAccessContext.mockReturnValueOnce(agentAccess);

    const response = await GET(
      new NextRequest("http://localhost/api/projects/project-1/tasks/search?q=launch"),
      { params: Promise.resolve({ projectId: "project-1" }) }
    );

    expect(response.status).toBe(200);
    expect(projectAccessServiceMock.requireAgentProjectScopes).toHaveBeenCalledWith({
      agentAccess,
      projectId: "project-1",
      requiredScopes: ["task:read"],
    });
    expect(taskSearchServiceMock.searchProjectTaskIds).toHaveBeenCalledWith({
      actorUserId: "owner-1",
      projectId: "project-1",
      query: "launch",
      agentAccess,
      limit: null,
    });
  });

  test("rejects agent callers without task:read scope before search", async () => {
    apiGuardMock.requireApiPrincipal.mockResolvedValueOnce({
      ok: true,
      principal: {
        kind: "agent",
        actorUserId: "owner-1",
        ownerUserId: "owner-1",
        credentialId: "credential-1",
        projectId: "project-1",
        scopes: [],
        tokenId: "token-1",
        requestId: "request-1",
      },
    });
    apiGuardMock.getAgentProjectAccessContext.mockReturnValueOnce({
      ...agentAccess,
      scopes: [],
    });
    projectAccessServiceMock.requireAgentProjectScopes.mockReturnValueOnce({
      ok: false,
      status: 403,
      error: "forbidden",
    });

    const response = await GET(
      new NextRequest("http://localhost/api/projects/project-1/tasks/search?q=launch"),
      { params: Promise.resolve({ projectId: "project-1" }) }
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "forbidden" });
    expect(taskSearchServiceMock.searchProjectTaskIds).not.toHaveBeenCalled();
  });

  test("passes an explicit limit through and clamps oversized values", async () => {
    const limitedResponse = await GET(
      new NextRequest(
        "http://localhost/api/projects/project-1/tasks/search?q=launch&limit=10"
      ),
      { params: Promise.resolve({ projectId: "project-1" }) }
    );
    expect(limitedResponse.status).toBe(200);
    expect(taskSearchServiceMock.searchProjectTaskIds).toHaveBeenLastCalledWith(
      expect.objectContaining({ limit: 10 })
    );

    await GET(
      new NextRequest(
        "http://localhost/api/projects/project-1/tasks/search?q=launch&limit=9999"
      ),
      { params: Promise.resolve({ projectId: "project-1" }) }
    );
    expect(taskSearchServiceMock.searchProjectTaskIds).toHaveBeenLastCalledWith(
      expect.objectContaining({ limit: 200 })
    );

    await GET(
      new NextRequest(
        "http://localhost/api/projects/project-1/tasks/search?q=launch&limit=-5"
      ),
      { params: Promise.resolve({ projectId: "project-1" }) }
    );
    expect(taskSearchServiceMock.searchProjectTaskIds).toHaveBeenLastCalledWith(
      expect.objectContaining({ limit: 1 })
    );
  });

  test.each(["lots", "10abc", "1.5", "1e2"])(
    "rejects malformed limits before search: %s",
    async (limit) => {
      const response = await GET(
        new NextRequest(
          `http://localhost/api/projects/project-1/tasks/search?q=launch&limit=${encodeURIComponent(limit)}`
        ),
        { params: Promise.resolve({ projectId: "project-1" }) }
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: "invalid-limit" });
      expect(taskSearchServiceMock.searchProjectTaskIds).not.toHaveBeenCalled();
    }
  );

  test("preserves service validation and authorization failures", async () => {
    taskSearchServiceMock.searchProjectTaskIds.mockResolvedValueOnce({
      ok: false,
      status: 400,
      error: "query-required",
    });

    const response = await GET(
      new NextRequest("http://localhost/api/projects/project-1/tasks/search"),
      { params: Promise.resolve({ projectId: "project-1" }) }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "query-required" });
  });
});
