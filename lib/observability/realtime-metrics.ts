import {
  getAppMetadataSummary,
  type AppRuntimeEnvironment,
} from "@/lib/app-metadata";
import {
  getRealtimeTransport,
  getRuntimeEnvironment,
  type RealtimeTransport,
} from "@/lib/env.server";
import { logServerInfo } from "@/lib/observability/logger";

export const REALTIME_METRIC_COUNTERS = [
  "activity.snapshotChecks",
  "activity.changesEmitted",
  "activity.pollingFallbacks",
  "notifications.snapshotChecks",
  "notifications.pollingFallbacks",
  "broadcast.tokenIssued",
  "broadcast.tokenDenied",
] as const;

export type RealtimeMetricCounter = (typeof REALTIME_METRIC_COUNTERS)[number];

export const REALTIME_METRICS_FLUSH_INTERVAL_MS = 60_000;

interface ServiceTimingAggregate {
  count: number;
  totalMs: number;
  maxMs: number;
}

export interface RealtimeMetricsSnapshot {
  environment: AppRuntimeEnvironment;
  revision: string | null;
  transport: RealtimeTransport;
  scope: "instance";
  generatedAt: string;
  counters: Record<RealtimeMetricCounter, number>;
  serviceTiming: Record<
    string,
    { count: number; totalMs: number; maxMs: number }
  >;
  database: { queryCalls: number };
}

const counters = new Map<RealtimeMetricCounter, number>();
const serviceTiming = new Map<string, ServiceTimingAggregate>();
let databaseQueryCalls = 0;
let lastFlushAtMs = 0;

function roundMs(value: number): number {
  return Math.round(value * 10) / 10;
}

export function recordRealtimeCounter(
  name: RealtimeMetricCounter,
  count = 1
): void {
  counters.set(name, (counters.get(name) ?? 0) + count);
  maybeFlushRealtimeMetrics();
}

export function recordServiceTiming(
  metricName: string,
  durationMs: number
): void {
  const current = serviceTiming.get(metricName) ?? {
    count: 0,
    totalMs: 0,
    maxMs: 0,
  };
  const normalizedDurationMs = Math.max(0, durationMs);

  serviceTiming.set(metricName, {
    count: current.count + 1,
    totalMs: current.totalMs + normalizedDurationMs,
    maxMs: Math.max(current.maxMs, normalizedDurationMs),
  });
  maybeFlushRealtimeMetrics();
}

export function recordDatabaseQueryCalls(count = 1): void {
  databaseQueryCalls += count;
  maybeFlushRealtimeMetrics();
}

export function getRealtimeMetricsSnapshot(): RealtimeMetricsSnapshot {
  const metadata = getAppMetadataSummary();

  const counterSnapshot = {} as Record<RealtimeMetricCounter, number>;
  for (const name of REALTIME_METRIC_COUNTERS) {
    counterSnapshot[name] = counters.get(name) ?? 0;
  }

  const timingSnapshot: RealtimeMetricsSnapshot["serviceTiming"] = {};
  for (const [name, aggregate] of serviceTiming.entries()) {
    timingSnapshot[name] = {
      count: aggregate.count,
      totalMs: roundMs(aggregate.totalMs),
      maxMs: roundMs(aggregate.maxMs),
    };
  }

  return {
    environment: metadata.environment,
    revision: metadata.revision,
    transport: getRealtimeTransport(),
    scope: "instance",
    generatedAt: new Date().toISOString(),
    counters: counterSnapshot,
    serviceTiming: timingSnapshot,
    database: { queryCalls: databaseQueryCalls },
  };
}

// Aggregates are per server instance and in-memory. The structured log line is
// a sampled snapshot (first event, then at most once per interval) that
// survives instance recycling; counts accumulated between samples on an
// instance recycled before the next sample are lost.
export function maybeFlushRealtimeMetrics(nowMs = Date.now()): void {
  if (getRuntimeEnvironment() !== "production") {
    return;
  }

  if (nowMs - lastFlushAtMs < REALTIME_METRICS_FLUSH_INTERVAL_MS) {
    return;
  }

  lastFlushAtMs = nowMs;
  const snapshot = getRealtimeMetricsSnapshot();
  logServerInfo("realtime.metrics", "Realtime metrics snapshot", {
    environment: snapshot.environment,
    revision: snapshot.revision,
    transport: snapshot.transport,
    scope: snapshot.scope,
    counters: snapshot.counters,
    serviceTiming: snapshot.serviceTiming,
    database: snapshot.database,
  });
}

export function resetRealtimeMetricsForTests(): void {
  counters.clear();
  serviceTiming.clear();
  databaseQueryCalls = 0;
  lastFlushAtMs = 0;
}
