import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

const apiGuardMock = vi.hoisted(() => ({
  getAgentProjectAccessContext: vi.fn(),
  requireApiPrincipal: vi.fn(),
}));

const projectAccessServiceMock = vi.hoisted(() => ({
  requireAgentProjectScopes: vi.fn(),
}));

const projectActivityServiceMock = vi.hoisted(() => ({
  listProjectActivityHistory: vi.fn(),
  PROJECT_ACTIVITY_HISTORY_PAGE_SIZE: 25,
}));

vi.mock("@/lib/auth/api-guard", () => ({
  getAgentProjectAccessContext: apiGuardMock.getAgentProjectAccessContext,
  requireApiPrincipal: apiGuardMock.requireApiPrincipal,
}));

vi.mock("@/lib/services/project-access-service", () => ({
  requireAgentProjectScopes: projectAccessServiceMock.requireAgentProjectScopes,
}));

vi.mock("@/lib/services/project-activity-service", () => ({
  listProjectActivityHistory:
    projectActivityServiceMock.listProjectActivityHistory,
  PROJECT_ACTIVITY_HISTORY_PAGE_SIZE:
    projectActivityServiceMock.PROJECT_ACTIVITY_HISTORY_PAGE_SIZE,
}));

import { GET as getProjectHistory } from "@/app/api/projects/[projectId]/history/route";

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

function projectParams(projectId: string) {
  return { params: Promise.resolve({ projectId }) };
}

function historyEntry() {
  return {
    id: "event-1",
    domain: "task",
    action: "updated",
    entityId: "task-1",
    entityDisplayNameSnapshot: "Ship the timeline",
    summary: 'Updated task "Ship the timeline"',
    changes: [{ field: "status", before: "Backlog", after: "Done" }],
    version: new Date("2026-09-18T10:00:00.000Z"),
    createdAt: new Date("2026-09-18T10:00:01.000Z"),
    actor: {
      kind: "human",
      id: "user-1",
      displayName: "Alice Example",
      usernameTag: "alice#0001",
      avatarSeed: "seed-alice",
      status: "active",
      isAssignable: true,
    },
  };
}

describe("project history route", () => {
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
    projectAccessServiceMock.requireAgentProjectScopes.mockReturnValue({ ok: true });
  });

  test("returns the serialized history page without caching", async () => {
    projectActivityServiceMock.listProjectActivityHistory.mockResolvedValueOnce({
      ok: true,
      data: {
        entries: [historyEntry()],
        nextCursor: "cursor-2",
      },
    });

    const response = await getProjectHistory(
      new NextRequest("http://localhost/api/projects/project-1/history") as never,
      projectParams("project-1")
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(readJson(response)).resolves.toEqual({
      entries: [
        {
          id: "event-1",
          domain: "task",
          action: "updated",
          entityId: "task-1",
          entityDisplayNameSnapshot: "Ship the timeline",
          summary: 'Updated task "Ship the timeline"',
          changes: [{ field: "status", before: "Backlog", after: "Done" }],
          version: "2026-09-18T10:00:00.000Z",
          createdAt: "2026-09-18T10:00:01.000Z",
          actor: {
            kind: "human",
            id: "user-1",
            displayName: "Alice Example",
            usernameTag: "alice#0001",
            avatarSeed: "seed-alice",
            status: "active",
            isAssignable: true,
          },
        },
      ],
      nextCursor: "cursor-2",
    });
    expect(
      projectActivityServiceMock.listProjectActivityHistory
    ).toHaveBeenCalledWith({
      actorUserId: "user-1",
      projectId: "project-1",
      cursor: null,
      take: 25,
    });
  });

  test("forwards explicit cursor and take parameters", async () => {
    projectActivityServiceMock.listProjectActivityHistory.mockResolvedValueOnce({
      ok: true,
      data: { entries: [], nextCursor: null },
    });

    const response = await getProjectHistory(
      new NextRequest(
        "http://localhost/api/projects/project-1/history?cursor=cursor-1&take=10"
      ) as never,
      projectParams("project-1")
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({
      entries: [],
      nextCursor: null,
    });
    expect(
      projectActivityServiceMock.listProjectActivityHistory
    ).toHaveBeenCalledWith({
      actorUserId: "user-1",
      projectId: "project-1",
      cursor: "cursor-1",
      take: 10,
    });
  });

  test("falls back to the default page size for invalid take values", async () => {
    projectActivityServiceMock.listProjectActivityHistory.mockResolvedValueOnce({
      ok: true,
      data: { entries: [], nextCursor: null },
    });

    await getProjectHistory(
      new NextRequest(
        "http://localhost/api/projects/project-1/history?take=not-a-number"
      ) as never,
      projectParams("project-1")
    );

    expect(
      projectActivityServiceMock.listProjectActivityHistory
    ).toHaveBeenCalledWith({
      actorUserId: "user-1",
      projectId: "project-1",
      cursor: null,
      take: 25,
    });
  });

  test("returns service failures without caching", async () => {
    projectActivityServiceMock.listProjectActivityHistory.mockResolvedValueOnce({
      ok: false,
      status: 400,
      error: "invalid-cursor",
    });

    const response = await getProjectHistory(
      new NextRequest("http://localhost/api/projects/project-1/history?cursor=bad") as never,
      projectParams("project-1")
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(readJson(response)).resolves.toEqual({ error: "invalid-cursor" });
  });

  test("rejects agent callers without the project read scope", async () => {
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
    apiGuardMock.getAgentProjectAccessContext.mockReturnValueOnce({
      credentialId: "credential-1",
      projectId: "project-1",
      scopes: ["task:read"],
    });
    projectAccessServiceMock.requireAgentProjectScopes.mockReturnValueOnce({
      ok: false,
      status: 403,
      error: "insufficient-scopes",
    });

    const response = await getProjectHistory(
      new NextRequest("http://localhost/api/projects/project-1/history") as never,
      projectParams("project-1")
    );

    expect(response.status).toBe(403);
    await expect(readJson(response)).resolves.toEqual({
      error: "insufficient-scopes",
    });
    expect(
      projectActivityServiceMock.listProjectActivityHistory
    ).not.toHaveBeenCalled();
  });
});
