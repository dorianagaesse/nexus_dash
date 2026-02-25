import { describe, expect, test } from "vitest";

import { hashPassword, verifyPassword } from "@/lib/services/password-service";

describe("password-service", () => {
  test("hashes and verifies password successfully", async () => {
    const passwordHash = await hashPassword("correct horse battery staple");

    expect(passwordHash).toContain("scrypt-v1");
    await expect(
      verifyPassword("correct horse battery staple", passwordHash)
    ).resolves.toBe(true);
  });

  test("rejects invalid password during verification", async () => {
    const passwordHash = await hashPassword("test-password");

    await expect(verifyPassword("wrong-password", passwordHash)).resolves.toBe(false);
  });

  test("returns false for malformed hash values", async () => {
    await expect(verifyPassword("test-password", "not-a-hash")).resolves.toBe(false);
  });
});
