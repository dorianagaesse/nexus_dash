import type { Pool, PoolClient } from "pg";

import { recordDatabaseQueryCalls } from "@/lib/observability/realtime-metrics";

const METERED_QUERY_CLIENT = Symbol.for("nexusdash.metered-pg-query-client");

type QueryableClient = Pick<PoolClient, "query"> & {
  [METERED_QUERY_CLIENT]?: true;
};

type QueryFunction = (...args: unknown[]) => unknown;

export function meterPgQueryClient<TClient extends QueryableClient>(
  client: TClient
): TClient {
  if (client[METERED_QUERY_CLIENT]) {
    return client;
  }

  const originalQuery = client.query.bind(client) as QueryFunction;

  client.query = ((...args: unknown[]) => {
    recordDatabaseQueryCalls(1);
    return originalQuery(...args);
  }) as PoolClient["query"];

  Object.defineProperty(client, METERED_QUERY_CLIENT, {
    value: true,
    enumerable: false,
  });

  return client;
}

export function installPgQueryMetrics(pool: Pool): Pool {
  const originalConnect = pool.connect.bind(pool) as Pool["connect"];

  pool.connect = ((callback?: Parameters<Pool["connect"]>[0]) => {
    if (typeof callback === "function") {
      originalConnect((error, client, release) => {
        callback(error, client ? meterPgQueryClient(client) : client, release);
      });
      return;
    }

    return originalConnect().then((client) => meterPgQueryClient(client));
  }) as Pool["connect"];

  return pool;
}
