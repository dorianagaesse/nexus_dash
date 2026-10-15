import { afterEach, expect, test, vi } from "vitest";
import { isRetryableTransactionError, retryTransaction } from "@/lib/services/transaction-retry";

afterEach(() => vi.useRealTimers());

test.each([
  { code: "P2034" }, { code: "40P01" }, { code: "40001" },
  { code: "P2010", meta: { code: "40P01" } },
  { code: "P2010", meta: { code: "40001" } },
])("recognizes aborted database transactions: %j", (error) => {
  expect(isRetryableTransactionError(error)).toBe(true);
});

test.each([null, new Error("timeout"), { code: "P2002" }, { code: "P2010", meta: { code: "42501" } }])(
  "does not retry other failures: %j", async (error) => {
    const operation = vi.fn().mockRejectedValue(error);
    await expect(retryTransaction(operation, true)).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(1);
  }
);

test("reopens the transaction with bounded backoff", async () => {
  vi.useFakeTimers();
  const operation = vi.fn().mockRejectedValueOnce({ code: "P2034" })
    .mockRejectedValueOnce({ code: "P2034" }).mockResolvedValue("accepted");
  const result = retryTransaction(operation, true);
  await vi.advanceTimersByTimeAsync(24);
  expect(operation).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(operation).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(50);
  await expect(result).resolves.toBe("accepted");
  expect(operation).toHaveBeenCalledTimes(3);
});

test("never replays an operation without a transaction guarantee", async () => {
  const error = { code: "P2034" };
  const operation = vi.fn().mockRejectedValue(error);
  await expect(retryTransaction(operation, false)).rejects.toBe(error);
  expect(operation).toHaveBeenCalledTimes(1);
});
