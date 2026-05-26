import { describe, expect, test, vi } from "vitest";

import { serializePgQueryClient } from "@/lib/pg-transaction-query-serialization";

function createDeferred<TValue>() {
  let resolve!: (value: TValue) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<TValue>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

describe("serializePgQueryClient", () => {
  test("runs overlapping query calls one at a time", async () => {
    const startedQueries: string[] = [];
    const queries = {
      first: createDeferred<string>(),
      second: createDeferred<string>(),
      third: createDeferred<string>(),
    };
    const client = {
      query: vi.fn((name: keyof typeof queries) => {
        startedQueries.push(name);
        return queries[name].promise;
      }),
    };

    const serializedClient = serializePgQueryClient(client);
    const first = serializedClient.query("first");
    const second = serializedClient.query("second");
    const third = serializedClient.query("third");

    await vi.waitFor(() => expect(startedQueries).toEqual(["first"]));

    queries.first.resolve("first-result");
    await expect(first).resolves.toBe("first-result");
    await vi.waitFor(() => expect(startedQueries).toEqual(["first", "second"]));

    queries.second.resolve("second-result");
    await expect(second).resolves.toBe("second-result");
    await vi.waitFor(() =>
      expect(startedQueries).toEqual(["first", "second", "third"])
    );

    queries.third.resolve("third-result");
    await expect(third).resolves.toBe("third-result");
  });

  test("continues the query queue after a query rejects", async () => {
    const startedQueries: string[] = [];
    const queries = {
      first: createDeferred<string>(),
      second: createDeferred<string>(),
    };
    const client = {
      query: vi.fn((name: keyof typeof queries) => {
        startedQueries.push(name);
        return queries[name].promise;
      }),
    };

    const serializedClient = serializePgQueryClient(client);
    const first = serializedClient.query("first");
    const second = serializedClient.query("second");

    queries.first.reject(new Error("first failed"));
    await expect(first).rejects.toThrow("first failed");
    await vi.waitFor(() => expect(startedQueries).toEqual(["first", "second"]));

    queries.second.resolve("second-result");
    await expect(second).resolves.toBe("second-result");
  });
});
