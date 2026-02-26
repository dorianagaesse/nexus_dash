import { beforeEach, describe, expect, test, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import { getAccountIdentitySummary } from "@/lib/services/account-identity-service";

describe("account-identity-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns null for missing actor user id", async () => {
    const result = await getAccountIdentitySummary("");
    expect(result).toBeNull();
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  test("returns null when user does not exist", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null);

    const result = await getAccountIdentitySummary("user-1");

    expect(result).toBeNull();
  });

  test("returns username tag when username identity is present", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      name: "Test User",
      email: "user@example.com",
      username: "test.user",
      usernameDiscriminator: "1a2b3c",
    });

    const result = await getAccountIdentitySummary("user-1");

    expect(result).toEqual({
      displayName: "test.user",
      username: "test.user",
      usernameDiscriminator: "1a2b3c",
      usernameTag: "test.user#1a2b3c",
    });
  });

  test("falls back to name/email when username identity is not present", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      name: null,
      email: "user@example.com",
      username: null,
      usernameDiscriminator: null,
    });

    const result = await getAccountIdentitySummary("user-1");

    expect(result).toEqual({
      displayName: "user",
      username: null,
      usernameDiscriminator: null,
      usernameTag: null,
    });
  });
});
