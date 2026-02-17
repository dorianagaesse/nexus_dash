import { beforeEach, describe, expect, test, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import { checkDatabaseReadiness } from "@/lib/services/health-service";

describe("checkDatabaseReadiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("resolves when prisma ping succeeds", async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([{ value: 1 }]);

    await expect(checkDatabaseReadiness()).resolves.toBeUndefined();
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
  });

  test("fails fast when prisma ping does not return before timeout", async () => {
    vi.useFakeTimers();
    try {
      prismaMock.$queryRaw.mockImplementationOnce(
        () => new Promise(() => undefined)
      );

      const readinessPromise = checkDatabaseReadiness();
      const capturedErrorPromise = readinessPromise.then(
        () => null,
        (error) => error as Error
      );
      await vi.advanceTimersByTimeAsync(2100);

      const error = await capturedErrorPromise;
      expect(error).toBeInstanceOf(Error);
      expect(error?.message).toBe(
        "Database readiness check timed out after 2000ms"
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
