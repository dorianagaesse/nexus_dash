import { afterEach, describe, expect, test, vi } from "vitest";

import {
  decryptGoogleToken,
  encryptGoogleToken,
} from "@/lib/services/google-token-crypto";

describe("google-token-crypto", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("returns plaintext when no encryption key is configured", () => {
    vi.stubEnv("GOOGLE_TOKEN_ENCRYPTION_KEY", "");

    const encrypted = encryptGoogleToken("token-abc");
    const decrypted = decryptGoogleToken(encrypted);

    expect(encrypted).toBe("token-abc");
    expect(decrypted).toBe("token-abc");
  });

  test("encrypts and decrypts token payload with configured key", () => {
    vi.stubEnv("GOOGLE_TOKEN_ENCRYPTION_KEY", "dev-encryption-key");

    const encrypted = encryptGoogleToken("token-abc");
    const decrypted = decryptGoogleToken(encrypted);

    expect(encrypted).not.toBe("token-abc");
    expect(encrypted.startsWith("enc:v1:")).toBe(true);
    expect(decrypted).toBe("token-abc");
  });
});
