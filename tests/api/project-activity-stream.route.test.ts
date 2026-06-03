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

import { GET as streamProjectActivity } from "@/app/api/projects/[projectId]/activity/stream/route";

function projectParams(projectId: string) {
  return { params: Promise.resolve({ projectId }) };
}

async function readFirstChunk(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("missing-response-body");
  }

  const { value } = await reader.read();
  await reader.cancel();
  return new TextDecoder().decode(value);
}

describe("project activity stream route", () => {
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

  test("streams the authorized project activity version as an SSE event", async () => {
    projectActivityServiceMock.getProjectActivitySnapshot.mockResolvedValueOnce({
      ok: true,
      data: {
        projectId: "project-1",
        version: new Date("2026-05-30T10:00:00.000Z"),
      },
    });

    const response = await streamProjectActivity(
      new Request("http://localhost/api/projects/project-1/activity/stream") as never,
      projectParams("project-1")
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("cache-control")).toBe("no-store, no-transform");

    const chunk = await readFirstChunk(response);
    expect(chunk).toContain("retry: 2000");
    expect(chunk).toContain("id: 2026-05-30T10:00:00.000Z");
    expect(chunk).toContain("event: project-activity");
    expect(chunk).toContain('"projectId":"project-1"');
    expect(chunk).toContain('"version":"2026-05-30T10:00:00.000Z"');
    expect(projectActivityServiceMock.getProjectActivitySnapshot).toHaveBeenCalledWith({
      actorUserId: "user-1",
      projectId: "project-1",
    });
  });

  test("returns service authorization failures before opening the stream", async () => {
    projectActivityServiceMock.getProjectActivitySnapshot.mockResolvedValueOnce({
      ok: false,
      status: 403,
      error: "forbidden",
    });

    const response = await streamProjectActivity(
      new Request("http://localhost/api/projects/project-1/activity/stream") as never,
      projectParams("project-1")
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "forbidden" });
  });
});
