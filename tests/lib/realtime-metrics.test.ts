import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const loggerMock = vi.hoisted(() => ({
  logServerInfo: vi.fn(),
}));

vi.mock("@/lib/observability/logger", () => ({
  logServerInfo: loggerMock.logServerInfo,
}));

import {
  getRealtimeMetricsSnapshot,
  maybeFlushRealtimeMetrics,
  recordDatabaseQueryCalls,
  recordRealtimeCounter,
  recordServiceTiming,
  REALTIME_METRIC_COUNTERS,
  REALTIME_METRICS_FLUSH_INTERVAL_MS,
  resetRealtimeMetricsForTests,
} from "@/lib/observability/realtime-metrics";

describe("realtime metrics registry", () => {
  beforeEach(() => {
    resetRealtimeMetricsForTests();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-03T10:00:00.000Z"));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  test("aggregates counters, service timing, and database query volume", () => {
    recordRealtimeCounter("activity.snapshotChecks");
    recordRealtimeCounter("activity.snapshotChecks");
    recordRealtimeCounter("broadcast.tokenIssued");
    recordServiceTiming("project.activity.poll", 12.34);
    recordServiceTiming("project.activity.poll", 4);
    recordDatabaseQueryCalls(3);

    const snapshot = getRealtimeMetricsSnapshot();

    expect(snapshot.counters["activity.snapshotChecks"]).toBe(2);
    expect(snapshot.counters["broadcast.tokenIssued"]).toBe(1);
    expect(snapshot.counters["activity.pollingFallbacks"]).toBe(0);
    expect(snapshot.counters["broadcast.tokenDenied"]).toBe(0);
    expect(snapshot.serviceTiming["project.activity.poll"]).toEqual({
      count: 2,
      totalMs: 16.3,
      maxMs: 12.3,
    });
    expect(snapshot.database.queryCalls).toBe(3);
    expect(snapshot.environment).toBe("test");
    expect(snapshot.transport).toBe("polling");
    expect(snapshot.generatedAt).toBe("2026-10-03T10:00:00.000Z");
  });

  test("publishes only fixed aggregate metric names, never request or caller data", () => {
    recordRealtimeCounter("activity.snapshotChecks");
    recordServiceTiming("project.activity.poll", 5);

    const snapshot = getRealtimeMetricsSnapshot();

    expect(Object.keys(snapshot).sort()).toEqual([
      "counters",
      "database",
      "environment",
      "generatedAt",
      "revision",
      "scope",
      "serviceTiming",
      "transport",
    ]);
    expect(Object.keys(snapshot.counters).sort()).toEqual(
      [...REALTIME_METRIC_COUNTERS].sort()
    );
    expect(Object.keys(snapshot.database)).toEqual(["queryCalls"]);
    expect(Object.keys(snapshot.serviceTiming)).toEqual(["project.activity.poll"]);
  });

  test("flushes a throttled structured snapshot on deployments", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("COMMIT_SHA", "abc1234def5678");

    recordRealtimeCounter("activity.snapshotChecks");

    expect(loggerMock.logServerInfo).toHaveBeenCalledTimes(1);
    expect(loggerMock.logServerInfo).toHaveBeenCalledWith(
      "realtime.metrics",
      "Realtime metrics snapshot",
      {
        environment: "preview",
        revision: "abc1234",
        transport: "polling",
        scope: "instance",
        counters: expect.objectContaining({ "activity.snapshotChecks": 1 }),
        serviceTiming: {},
        database: { queryCalls: 0 },
      }
    );

    recordRealtimeCounter("activity.snapshotChecks");
    expect(loggerMock.logServerInfo).toHaveBeenCalledTimes(1);

    vi.setSystemTime(
      new Date(Date.now() + REALTIME_METRICS_FLUSH_INTERVAL_MS)
    );
    recordRealtimeCounter("broadcast.tokenIssued");
    expect(loggerMock.logServerInfo).toHaveBeenCalledTimes(2);
    expect(loggerMock.logServerInfo).toHaveBeenLastCalledWith(
      "realtime.metrics",
      "Realtime metrics snapshot",
      expect.objectContaining({
        counters: expect.objectContaining({
          "activity.snapshotChecks": 2,
          "broadcast.tokenIssued": 1,
        }),
      })
    );
  });

  test("a burst shorter than the flush interval yields one sampled snapshot that can undercount", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "preview");

    recordRealtimeCounter("activity.snapshotChecks");
    recordRealtimeCounter("broadcast.tokenIssued", 4);
    recordDatabaseQueryCalls(3);

    expect(loggerMock.logServerInfo).toHaveBeenCalledTimes(1);
    const sampledRecord = loggerMock.logServerInfo.mock.calls[0]?.[2] as {
      counters: Record<string, number>;
      database: { queryCalls: number };
    };
    expect(sampledRecord.counters["activity.snapshotChecks"]).toBe(1);
    expect(sampledRecord.counters["broadcast.tokenIssued"]).toBe(0);
    expect(sampledRecord.database.queryCalls).toBe(0);

    vi.setSystemTime(new Date(Date.now() + REALTIME_METRICS_FLUSH_INTERVAL_MS));
    recordRealtimeCounter("activity.snapshotChecks");

    expect(loggerMock.logServerInfo).toHaveBeenCalledTimes(2);
    const nextRecord = loggerMock.logServerInfo.mock.calls[1]?.[2] as {
      counters: Record<string, number>;
      database: { queryCalls: number };
    };
    expect(nextRecord.counters["activity.snapshotChecks"]).toBe(2);
    expect(nextRecord.counters["broadcast.tokenIssued"]).toBe(4);
    expect(nextRecord.database.queryCalls).toBe(3);
  });

  test("does not flush in local and test runtimes", () => {
    recordRealtimeCounter("activity.snapshotChecks");
    recordServiceTiming("task.status", 10);
    recordDatabaseQueryCalls(5);

    expect(loggerMock.logServerInfo).not.toHaveBeenCalled();
  });

  test("maybeFlushRealtimeMetrics respects the flush interval", () => {
    vi.stubEnv("NODE_ENV", "production");
    const startedAt = Date.parse("2026-10-03T10:00:00.000Z");

    maybeFlushRealtimeMetrics(startedAt);
    expect(loggerMock.logServerInfo).toHaveBeenCalledTimes(1);

    maybeFlushRealtimeMetrics(startedAt + REALTIME_METRICS_FLUSH_INTERVAL_MS - 1);
    expect(loggerMock.logServerInfo).toHaveBeenCalledTimes(1);

    maybeFlushRealtimeMetrics(startedAt + REALTIME_METRICS_FLUSH_INTERVAL_MS);
    expect(loggerMock.logServerInfo).toHaveBeenCalledTimes(2);
  });
});
