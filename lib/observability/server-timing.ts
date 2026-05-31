import { performance } from "node:perf_hooks";

function sanitizeMetricName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 64) || "app";
}

export function startServerTiming(metricName: string) {
  const startedAt = performance.now();
  const normalizedMetricName = sanitizeMetricName(metricName);

  return {
    headers(): HeadersInit {
      const durationMs = Math.max(0, performance.now() - startedAt);
      return {
        "Server-Timing": `${normalizedMetricName};dur=${durationMs.toFixed(1)}`,
      };
    },
  };
}
