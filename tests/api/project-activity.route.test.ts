import { beforeEach, describe, expect, test, vi } from "vitest";

const apiGuardMock = vi.hoisted(() => ({
  getAgentProjectAccessContext: vi.fn(),
  requireApiPrincipal: vi.fn(),
}));

const projectAccessServiceMock = vi.hoisted(() => ({
  requireAgentProjectScopes: vi.fn(),
}));

const projectActivityServiceMock = vi.hoisted(() => ({
  getProjectActivitySnapshot: vi.fn(),
}));

vi.mock("@/lib/auth/api-guard", () => ({
  getAgentProjectAccessContext: apiGuardMock.getAgentProjectAccessContext,
  requireApiPrincipal: apiGuardMock.requireApiPrincipal,
}));

vi.mock("@/lib/services/project-access-service", () => ({
  requireAgentProjectScopes: projectAccessServiceMock.requireAgentProjectScopes,
}));

vi.mock("@/lib/services/project-activity-service", () => ({
  getProjectActivitySnapshot: projectActivityServiceMock.getProjectActivitySnapshot,
}));

import { GET as getProjectActivity } from "@/app/api/projects/[projectId]/activity/route";

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

function projectParams(projectId: string) {
  return { params: Promise.resolve({ projectId }) };
}

describe("project activity route", () => {
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

  test("returns the authorized project activity version without caching", async () => {
    projectActivityServiceMock.getProjectActivitySnapshot.mockResolvedValueOnce({
      ok: true,
      data: {
        projectId: "project-1",
        version: new Date("2026-05-30T10:00:00.000Z"),
      },
    });

    const response = await getProjectActivity(
      new Request("http://localhost/api/projects/project-1/activity") as never,
      projectParams("project-1")
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(readJson(response)).resolves.toMatchObject({
      projectId: "project-1",
      version: "2026-05-30T10:00:00.000Z",
    });
    expect(projectActivityServiceMock.getProjectActivitySnapshot).toHaveBeenCalledWith({
      actorUserId: "user-1",
      projectId: "project-1",
    });
  });

  test("returns service authorization failures", async () => {
    projectActivityServiceMock.getProjectActivitySnapshot.mockResolvedValueOnce({
      ok: false,
      status: 403,
      error: "forbidden",
    });

    const response = await getProjectActivity(
      new Request("http://localhost/api/projects/project-1/activity") as never,
      projectParams("project-1")
    );

    expect(response.status).toBe(403);
    await expect(readJson(response)).resolves.toEqual({ error: "forbidden" });
  });
});
