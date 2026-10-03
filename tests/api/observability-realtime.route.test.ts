import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { NextResponse } from "next/server";

const apiGuardMock = vi.hoisted(() => ({
  requireAuthenticatedApiUser: vi.fn(),
}));

vi.mock("@/lib/auth/api-guard", () => ({
  requireAuthenticatedApiUser: apiGuardMock.requireAuthenticatedApiUser,
}));

import { GET as getRealtimeMetrics } from "@/app/api/observability/realtime/route";
import {
  recordDatabaseQueryCalls,
  recordRealtimeCounter,
  REALTIME_METRIC_COUNTERS,
  resetRealtimeMetricsForTests,
} from "@/lib/observability/realtime-metrics";

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("observability realtime metrics route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRealtimeMetricsForTests();
    vi.stubEnv("COMMIT_SHA", "");
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "");
    vi.stubEnv("GITHUB_SHA", "");
    apiGuardMock.requireAuthenticatedApiUser.mockResolvedValue({
      ok: true,
      userId: "user-1",
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("returns the aggregate telemetry snapshot for authorized principals", async () => {
    recordRealtimeCounter("activity.snapshotChecks");
    recordRealtimeCounter("stream.connections", 2);
    recordDatabaseQueryCalls(7);

    const response = await getRealtimeMetrics(
      new Request("http://localhost/api/observability/realtime") as never
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const body = await readJson(response);
    expect(body).toEqual({
      metrics: {
        environment: "test",
        revision: null,
        transport: "stream",
        scope: "instance",
        generatedAt: expect.any(String),
        counters: {
          ...Object.fromEntries(REALTIME_METRIC_COUNTERS.map((name) => [name, 0])),
          "activity.snapshotChecks": 1,
          "stream.connections": 2,
        },
        serviceTiming: {},
        database: { queryCalls: 7 },
      },
    });
  });

  test("rejects unauthorized requests without exposing telemetry", async () => {
    apiGuardMock.requireAuthenticatedApiUser.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    });

    const response = await getRealtimeMetrics(
      new Request("http://localhost/api/observability/realtime") as never
    );

    expect(response.status).toBe(401);
    await expect(readJson(response)).resolves.toEqual({ error: "unauthorized" });
  });
});
