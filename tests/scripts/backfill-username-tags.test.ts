import { beforeEach, describe, expect, test, vi } from "vitest";

const cryptoMock = vi.hoisted(() => ({
  randomInt: vi.fn(),
}));

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return {
    ...actual,
    randomInt: cryptoMock.randomInt,
  };
});

import {
  backfillUsernameTags,
  buildBackfillUsername,
  formatBackfillReport,
  generateUsernameDiscriminator,
  isValidBackfillUsername,
} from "../../scripts/backfill-username-tags.mjs";

function createPrismaMock() {
  return {
    user: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  };
}

const taglessUser = {
  id: "user-1",
  name: "Dorian Agaesse",
  email: "dorian@example.com",
  username: null,
  usernameDiscriminator: null,
};

describe("username tag backfill script", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cryptoMock.randomInt.mockReturnValue(42);
  });

  describe("buildBackfillUsername", () => {
    test("derives a dot-separated handle from the display name", () => {
      expect(buildBackfillUsername("Dorian Agaesse")).toBe("dorian.agaesse");
    });

    test("collapses separator runs and trims edge separators", () => {
      expect(buildBackfillUsername("hello__world")).toBe("hello.world");
      expect(buildBackfillUsername("__leading")).toBe("leading");
      expect(buildBackfillUsername("trailing._")).toBe("trailing");
    });

    test("drops characters outside the username shape", () => {
      expect(buildBackfillUsername("Émile Zola")).toBe("mile.zola");
      expect(buildBackfillUsername("user@example.com")).toBe(
        "user.example.com"
      );
    });

    test("keeps policy-valid handles unchanged", () => {
      expect(buildBackfillUsername("a.b.c")).toBe("a.b.c");
    });

    test("pads short handles to the minimum length", () => {
      expect(buildBackfillUsername("ab")).toBe("abu");
    });

    test("falls back to a valid placeholder for empty input", () => {
      expect(buildBackfillUsername("..")).toBe("user");
      expect(buildBackfillUsername(null)).toBe("user");
    });

    test("truncates overlong handles to the policy maximum", () => {
      const username = buildBackfillUsername("x".repeat(30));
      expect(username).toBe("x".repeat(20));
      expect(isValidBackfillUsername(username)).toBe(true);
    });
  });

  describe("isValidBackfillUsername", () => {
    test("accepts dot-separated lowercase handles", () => {
      expect(isValidBackfillUsername("first.last")).toBe(true);
    });

    test("rejects empty dot segments, casing, and out-of-range lengths", () => {
      expect(isValidBackfillUsername(".first")).toBe(false);
      expect(isValidBackfillUsername("first.")).toBe(false);
      expect(isValidBackfillUsername("first..last")).toBe(false);
      expect(isValidBackfillUsername("First.Last")).toBe(false);
      expect(isValidBackfillUsername("ab")).toBe(false);
      expect(isValidBackfillUsername("a".repeat(21))).toBe(false);
    });
  });

  describe("generateUsernameDiscriminator", () => {
    test("pads the random value to four digits", () => {
      cryptoMock.randomInt.mockReturnValue(7);
      expect(generateUsernameDiscriminator()).toBe("0007");
      expect(cryptoMock.randomInt).toHaveBeenCalledWith(0, 10000);
    });
  });

  describe("backfillUsernameTags", () => {
    test("scans only accounts missing a tag, oldest first", async () => {
      const prisma = createPrismaMock();
      prisma.user.findMany.mockResolvedValueOnce([]);

      await backfillUsernameTags(prisma);

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {
          OR: [{ username: null }, { usernameDiscriminator: null }],
        },
        select: {
          id: true,
          name: true,
          email: true,
          username: true,
          usernameDiscriminator: true,
        },
        orderBy: { createdAt: "asc" },
      });
    });

    test("derives a username from the display name without changing it", async () => {
      const prisma = createPrismaMock();
      prisma.user.findMany.mockResolvedValueOnce([taglessUser]);
      prisma.user.updateMany.mockResolvedValueOnce({ count: 1 });

      const report = await backfillUsernameTags(prisma);

      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: {
          id: "user-1",
          OR: [{ username: null }, { usernameDiscriminator: null }],
        },
        data: {
          username: "dorian.agaesse",
          usernameDiscriminator: "0042",
        },
      });
      expect(report).toEqual({
        dryRun: false,
        scanned: 1,
        updated: [
          { userId: "user-1", username: "dorian.agaesse", discriminator: "0042" },
        ],
        skipped: [],
        failures: [],
      });
    });

    test("keeps an existing handle and fills only the discriminator", async () => {
      const prisma = createPrismaMock();
      prisma.user.findMany.mockResolvedValueOnce([
        { ...taglessUser, username: "dorian1", name: "Dorian" },
      ]);
      prisma.user.updateMany.mockResolvedValueOnce({ count: 1 });

      const report = await backfillUsernameTags(prisma);

      expect(prisma.user.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            username: "dorian1",
            usernameDiscriminator: "0042",
          },
        })
      );
      expect(report.updated).toEqual([
        { userId: "user-1", username: "dorian1", discriminator: "0042" },
      ]);
    });

    test("uses a preserved discriminator when only the username is missing", async () => {
      const prisma = createPrismaMock();
      prisma.user.findMany.mockResolvedValueOnce([
        {
          ...taglessUser,
          name: "Corelia",
          email: null,
          username: null,
          usernameDiscriminator: "5678",
        },
      ]);
      prisma.user.updateMany.mockResolvedValueOnce({ count: 1 });

      const report = await backfillUsernameTags(prisma);

      expect(cryptoMock.randomInt).not.toHaveBeenCalled();
      expect(prisma.user.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            username: "corelia",
            usernameDiscriminator: "5678",
          },
        })
      );
      expect(report.updated).toEqual([
        { userId: "user-1", username: "corelia", discriminator: "5678" },
      ]);
    });

    test("skips accounts tagged between scan and update", async () => {
      const prisma = createPrismaMock();
      prisma.user.findMany.mockResolvedValueOnce([taglessUser]);
      prisma.user.updateMany.mockResolvedValueOnce({ count: 0 });

      const report = await backfillUsernameTags(prisma);

      expect(report.updated).toEqual([]);
      expect(report.skipped).toEqual(["user-1"]);
      expect(report.failures).toEqual([]);
    });

    test("retries with a fresh discriminator on a unique collision", async () => {
      const prisma = createPrismaMock();
      prisma.user.findMany.mockResolvedValueOnce([taglessUser]);
      prisma.user.updateMany
        .mockRejectedValueOnce({ code: "P2002" })
        .mockResolvedValueOnce({ count: 1 });
      cryptoMock.randomInt
        .mockReturnValueOnce(1)
        .mockReturnValueOnce(2);

      const report = await backfillUsernameTags(prisma);

      expect(prisma.user.updateMany).toHaveBeenCalledTimes(2);
      expect(prisma.user.updateMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          data: {
            username: "dorian.agaesse",
            usernameDiscriminator: "0002",
          },
        })
      );
      expect(report.updated).toEqual([
        { userId: "user-1", username: "dorian.agaesse", discriminator: "0002" },
      ]);
      expect(report.failures).toEqual([]);
    });

    test("records non-collision failures without retrying", async () => {
      const prisma = createPrismaMock();
      prisma.user.findMany.mockResolvedValueOnce([taglessUser]);
      prisma.user.updateMany.mockRejectedValueOnce(
        Object.assign(new Error("connection reset"), { code: "P1000" })
      );

      const report = await backfillUsernameTags(prisma);

      expect(prisma.user.updateMany).toHaveBeenCalledTimes(1);
      expect(report.failures).toEqual([
        { userId: "user-1", reason: "connection reset" },
      ]);
      expect(report.updated).toEqual([]);
    });

    test("reports discriminator space exhaustion after the attempt cap", async () => {
      const prisma = createPrismaMock();
      prisma.user.findMany.mockResolvedValueOnce([taglessUser]);
      prisma.user.updateMany.mockRejectedValue({ code: "P2002" });

      const report = await backfillUsernameTags(prisma);

      expect(prisma.user.updateMany).toHaveBeenCalledTimes(12);
      expect(report.failures).toEqual([
        { userId: "user-1", reason: "discriminator-space-exhausted" },
      ]);
    });

    test("dry run plans updates without writing", async () => {
      const prisma = createPrismaMock();
      prisma.user.findMany.mockResolvedValueOnce([taglessUser]);

      const report = await backfillUsernameTags(prisma, { dryRun: true });

      expect(prisma.user.updateMany).not.toHaveBeenCalled();
      expect(report).toEqual({
        dryRun: true,
        scanned: 1,
        updated: [
          { userId: "user-1", username: "dorian.agaesse", discriminator: "0042" },
        ],
        skipped: [],
        failures: [],
      });
    });
  });

  describe("formatBackfillReport", () => {
    test("summarizes updates, skips, and failures", () => {
      const lines = formatBackfillReport({
        dryRun: false,
        scanned: 2,
        updated: [
          { userId: "user-1", username: "first.last", discriminator: "0042" },
        ],
        skipped: ["user-9"],
        failures: [{ userId: "user-8", reason: "boom" }],
      }).split("\n");

      expect(lines[0]).toBe(
        "Username tag backfill: scanned 2, updated 1, skipped 1, failed 1"
      );
      expect(lines).toContain("- assigned first.last#0042 to user-1");
      expect(lines).toContain("- skipped user-9 (already tagged)");
      expect(lines).toContain("- failed user-8: boom");
    });

    test("labels dry runs", () => {
      const summary = formatBackfillReport({
        dryRun: true,
        scanned: 0,
        updated: [],
        skipped: [],
        failures: [],
      });
      expect(summary).toContain("Username tag backfill (dry run):");
    });
  });
});
