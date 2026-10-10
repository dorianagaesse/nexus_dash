import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

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
import {
  getRealtimeMetricsSnapshot,
  resetRealtimeMetricsForTests,
} from "@/lib/observability/realtime-metrics";

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

function projectParams(projectId: string) {
  return { params: Promise.resolve({ projectId }) };
}

describe("project activity route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRealtimeMetricsForTests();
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

  afterEach(() => {
    vi.unstubAllEnvs();
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

  test("counts served snapshot checks and reports service timing", async () => {
    vi.stubEnv("REALTIME_TRANSPORT", "polling");
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
    expect(response.headers.get("server-timing")).toMatch(
      /^project.activity.poll;dur=\d+\.\d$/
    );

    const snapshot = getRealtimeMetricsSnapshot();
    expect(snapshot.counters["activity.snapshotChecks"]).toBe(1);
    expect(snapshot.counters["activity.pollingFallbacks"]).toBe(0);
    expect(snapshot.serviceTiming["project.activity.poll"]?.count).toBe(1);
  });

  test("attributes human polls to polling fallbacks while Broadcast is active", async () => {
    vi.stubEnv("REALTIME_TRANSPORT", "broadcast");
    projectActivityServiceMock.getProjectActivitySnapshot.mockResolvedValueOnce({
      ok: true,
      data: {
        projectId: "project-1",
        version: new Date("2026-05-30T10:00:00.000Z"),
      },
    });

    await getProjectActivity(
      new Request("http://localhost/api/projects/project-1/activity") as never,
      projectParams("project-1")
    );

    const snapshot = getRealtimeMetricsSnapshot();
    expect(snapshot.counters["activity.snapshotChecks"]).toBe(1);
    expect(snapshot.counters["activity.pollingFallbacks"]).toBe(1);
  });

  test("Broadcast subscribe reconciliation does not count as polling fallback", async () => {
    vi.stubEnv("REALTIME_TRANSPORT", "broadcast");
    projectActivityServiceMock.getProjectActivitySnapshot.mockResolvedValueOnce({
      ok: true,
      data: { projectId: "project-1", version: new Date("2026-05-30T10:00:00.000Z") },
    });
    await getProjectActivity(new Request(
      "http://localhost/api/projects/project-1/activity",
      { headers: { "x-realtime-reconcile": "1" } }
    ) as never, projectParams("project-1"));
    expect(getRealtimeMetricsSnapshot().counters["activity.pollingFallbacks"]).toBe(0);
  });

  test("does not attribute agent polls to polling fallbacks", async () => {
    vi.stubEnv("REALTIME_TRANSPORT", "broadcast");
    apiGuardMock.requireApiPrincipal.mockResolvedValueOnce({
      ok: true,
      principal: {
        kind: "agent",
        actorUserId: "agent-user-1",
        requestId: "request-1",
      },
    });
    projectActivityServiceMock.getProjectActivitySnapshot.mockResolvedValueOnce({
      ok: true,
      data: {
        projectId: "project-1",
        version: new Date("2026-05-30T10:00:00.000Z"),
      },
    });

    await getProjectActivity(
      new Request("http://localhost/api/projects/project-1/activity") as never,
      projectParams("project-1")
    );

    const snapshot = getRealtimeMetricsSnapshot();
    expect(snapshot.counters["activity.snapshotChecks"]).toBe(1);
    expect(snapshot.counters["activity.pollingFallbacks"]).toBe(0);
  });
});
