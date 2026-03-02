import { logServerInfo } from "@/lib/observability/logger";

interface RouteTimingMetric {
  name: string;
  durationMs: number;
}

interface FinalizeRouteTimingInput {
  response: Response;
  metadata?: Record<string, unknown>;
}

function roundDuration(value: number): number {
  return Number(Math.max(0, value).toFixed(1));
}

function formatServerTimingHeader(metrics: RouteTimingMetric[]): string {
  return metrics
    .map((metric) => `${metric.name};dur=${roundDuration(metric.durationMs)}`)
    .join(", ");
}

export function createRouteTimer(scope: string, request: Request) {
  const startedAt = performance.now();
  const metrics: RouteTimingMetric[] = [];

  const pushMetric = (name: string, durationMs: number) => {
    metrics.push({
      name,
      durationMs: Math.max(0, durationMs),
    });
  };

  return {
    async measure<T>(name: string, callback: () => Promise<T> | T): Promise<T> {
      const measurementStartedAt = performance.now();
      try {
        return await callback();
      } finally {
        pushMetric(name, performance.now() - measurementStartedAt);
      }
    },
    finalize({ response, metadata = {} }: FinalizeRouteTimingInput): Response {
      const totalDurationMs = performance.now() - startedAt;
      pushMetric("total", totalDurationMs);

      const serverTimingHeader = formatServerTimingHeader(metrics);
      if (serverTimingHeader) {
        response.headers.set("Server-Timing", serverTimingHeader);
      }

      logServerInfo(scope, "Route timing", {
        requestId: request.headers.get("x-request-id"),
        metrics: metrics.map((metric) => ({
          name: metric.name,
          durationMs: roundDuration(metric.durationMs),
        })),
        ...metadata,
      });

      return response;
    },
  };
}
