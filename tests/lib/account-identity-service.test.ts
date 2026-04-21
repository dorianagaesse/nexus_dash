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
      id: "user-1",
      name: "Test User",
      email: "user@example.com",
      username: "test.user",
      usernameDiscriminator: "1234",
      avatarSeed: "seed-123",
    });

    const result = await getAccountIdentitySummary("user-1");

    expect(result).toEqual({
      displayName: "test.user",
      username: "test.user",
      usernameDiscriminator: "1234",
      usernameTag: "test.user#1234",
      avatarSeed: "seed-123",
    });
  });

  test("hides invalid legacy discriminator from account identity summary", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "user-1",
      name: "Test User",
      email: "user@example.com",
      username: "test.user",
      usernameDiscriminator: "ab12cd",
      avatarSeed: null,
    });

    const result = await getAccountIdentitySummary("user-1");

    expect(result).toEqual({
      displayName: "test.user",
      username: "test.user",
      usernameDiscriminator: null,
      usernameTag: null,
      avatarSeed: "user-1",
    });
  });

  test("falls back to name/email when username identity is not present", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "user-1",
      name: null,
      email: "user@example.com",
      username: null,
      usernameDiscriminator: null,
      avatarSeed: null,
    });

    const result = await getAccountIdentitySummary("user-1");

    expect(result).toEqual({
      displayName: "user",
      username: null,
      usernameDiscriminator: null,
      usernameTag: null,
      avatarSeed: "user-1",
    });
  });

  test("falls back to Account when email has no local-part separator", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "user-1",
      name: null,
      email: "invalid-email-format",
      username: null,
      usernameDiscriminator: null,
      avatarSeed: null,
    });

    const result = await getAccountIdentitySummary("user-1");

    expect(result).toEqual({
      displayName: "Account",
      username: null,
      usernameDiscriminator: null,
      usernameTag: null,
      avatarSeed: "user-1",
    });
  });
});
