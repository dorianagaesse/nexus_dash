import { performance } from "node:perf_hooks";

import { recordServiceTiming } from "@/lib/observability/realtime-metrics";

function sanitizeMetricName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 64) || "app";
}

export function startServerTiming(metricName: string) {
  const startedAt = performance.now();
  const normalizedMetricName = sanitizeMetricName(metricName);
  let measuredValue: string | null = null;

  function measure(): string {
    if (measuredValue === null) {
      const durationMs = Math.max(0, performance.now() - startedAt);
      measuredValue = `${normalizedMetricName};dur=${durationMs.toFixed(1)}`;
      recordServiceTiming(metricName, durationMs);
    }

    return measuredValue;
  }

  return {
    headers(): HeadersInit {
      const value = measure();
      return {
        "Server-Timing": value,
        "x-nexusdash-server-timing": value,
      };
    },
  };
}
