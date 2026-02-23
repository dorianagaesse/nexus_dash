import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

import { getOptionalServerEnv } from "@/lib/env.server";

const ENCRYPTED_TOKEN_PREFIX = "enc:v1";
const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const ENCRYPTION_IV_BYTES = 12;

function getGoogleTokenEncryptionKey(): Buffer | null {
  const rawKey = getOptionalServerEnv("GOOGLE_TOKEN_ENCRYPTION_KEY");
  if (!rawKey) {
    return null;
  }

  return createHash("sha256").update(rawKey).digest();
}

export function encryptGoogleToken(rawToken: string): string {
  const key = getGoogleTokenEncryptionKey();
  if (!key) {
    return rawToken;
  }

  const iv = randomBytes(ENCRYPTION_IV_BYTES);
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(rawToken, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `${ENCRYPTED_TOKEN_PREFIX}:${iv.toString("base64url")}:${authTag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

export function decryptGoogleToken(storedToken: string): string {
  if (!storedToken.startsWith(`${ENCRYPTED_TOKEN_PREFIX}:`)) {
    return storedToken;
  }

  const key = getGoogleTokenEncryptionKey();
  if (!key) {
    throw new Error("missing-google-token-encryption-key");
  }

  const parts = storedToken.split(":");
  if (parts.length !== 5) {
    throw new Error("invalid-google-token-ciphertext");
  }

  const iv = Buffer.from(parts[2], "base64url");
  const authTag = Buffer.from(parts[3], "base64url");
  const encrypted = Buffer.from(parts[4], "base64url");

  const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}
