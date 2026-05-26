import type { Pool, PoolClient } from "pg";

const SERIALIZED_QUERY_CLIENT = Symbol.for(
  "nexusdash.serialized-pg-query-client"
);

type QueryableClient = Pick<PoolClient, "query"> & {
  [SERIALIZED_QUERY_CLIENT]?: true;
};

type QueryFunction = (...args: unknown[]) => unknown;

export function serializePgQueryClient<TClient extends QueryableClient>(
  client: TClient
): TClient {
  if (client[SERIALIZED_QUERY_CLIENT]) {
    return client;
  }

  const originalQuery = client.query.bind(client) as QueryFunction;
  let queue = Promise.resolve();

  client.query = ((...args: unknown[]) => {
    const result = queue.then(() => originalQuery(...args));
    queue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }) as PoolClient["query"];

  Object.defineProperty(client, SERIALIZED_QUERY_CLIENT, {
    value: true,
    enumerable: false,
  });

  return client;
}

export function installSerializedTransactionQueries(pool: Pool): Pool {
  const originalConnect = pool.connect.bind(pool) as () => Promise<PoolClient>;

  pool.connect = (async () => {
    const client = await originalConnect();
    return serializePgQueryClient(client);
  }) as Pool["connect"];

  return pool;
}
