interface ClientTimingRecord {
  scope: string;
  durationMs: number;
  at: string;
  metadata: Record<string, unknown>;
}

declare global {
  interface Window {
    __NEXUSDASH_CLIENT_TIMINGS__?: ClientTimingRecord[];
  }
}

function roundDuration(value: number): number {
  return Number(Math.max(0, value).toFixed(1));
}

function readNow(): number {
  if (typeof performance === "undefined") {
    return Date.now();
  }

  return performance.now();
}

export function createClientTimer(scope: string) {
  const startedAt = readNow();

  return {
    end(metadata: Record<string, unknown> = {}): number {
      const durationMs = roundDuration(readNow() - startedAt);

      if (typeof window !== "undefined") {
        const nextRecord: ClientTimingRecord = {
          scope,
          durationMs,
          at: new Date().toISOString(),
          metadata,
        };
        const existing = window.__NEXUSDASH_CLIENT_TIMINGS__ ?? [];
        window.__NEXUSDASH_CLIENT_TIMINGS__ = [...existing.slice(-99), nextRecord];
      }

      if (process.env.NODE_ENV !== "production") {
        console.info("[client-timing]", scope, {
          durationMs,
          ...metadata,
        });
      }

      return durationMs;
    },
  };
}
