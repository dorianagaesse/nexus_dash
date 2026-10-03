import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Pool, PoolClient } from "pg";

const metricsMock = vi.hoisted(() => ({
  recordDatabaseQueryCalls: vi.fn(),
}));

vi.mock("@/lib/observability/realtime-metrics", () => ({
  recordDatabaseQueryCalls: metricsMock.recordDatabaseQueryCalls,
}));

import {
  installPgQueryMetrics,
  meterPgQueryClient,
} from "@/lib/observability/pg-query-metrics";

describe("meterPgQueryClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("counts every driver query call", async () => {
    const originalQuery = vi.fn().mockResolvedValue("ok");
    const client = { query: originalQuery };

    const meteredClient = meterPgQueryClient(client);
    await expect(meteredClient.query("select 1")).resolves.toBe("ok");
    await expect(meteredClient.query("select 2")).resolves.toBe("ok");

    expect(metricsMock.recordDatabaseQueryCalls).toHaveBeenCalledTimes(2);
    expect(metricsMock.recordDatabaseQueryCalls).toHaveBeenCalledWith(1);
    expect(originalQuery).toHaveBeenCalledTimes(2);
  });

  test("meters a client only once", async () => {
    const client = {
      query: vi.fn().mockResolvedValue("ok"),
    };

    const meteredClient = meterPgQueryClient(meterPgQueryClient(client));
    await meteredClient.query("select 1");

    expect(metricsMock.recordDatabaseQueryCalls).toHaveBeenCalledTimes(1);
  });
});

describe("installPgQueryMetrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("meters clients from promise-style connect calls", async () => {
    const client = {
      query: vi.fn().mockResolvedValue("ok"),
    } as unknown as PoolClient;
    const pool = {
      connect: vi.fn().mockResolvedValue(client),
    } as unknown as Pool;

    installPgQueryMetrics(pool);

    const connectedClient = await pool.connect();
    await connectedClient.query("select 1");

    expect(metricsMock.recordDatabaseQueryCalls).toHaveBeenCalledTimes(1);
  });

  test("meters clients from callback-style connect calls", async () => {
    const client = {
      query: vi.fn().mockResolvedValue("ok"),
    } as unknown as PoolClient;
    const release = vi.fn();
    const pool = {
      connect: vi.fn((callback) => {
        callback(undefined, client, release);
      }),
    } as unknown as Pool;

    installPgQueryMetrics(pool);

    await new Promise<void>((resolve, reject) => {
      pool.connect((error, connectedClient, done) => {
        if (error || !connectedClient) {
          reject(error ?? new Error("Expected connected client"));
          return;
        }

        connectedClient
          .query("select 1")
          .then(() => {
            expect(done).toBe(release);
            resolve();
          })
          .catch(reject);
      });
    });

    expect(metricsMock.recordDatabaseQueryCalls).toHaveBeenCalledTimes(1);
  });
});
