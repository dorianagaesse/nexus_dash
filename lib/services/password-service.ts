import crypto from "node:crypto";

const PASSWORD_HASH_VERSION = "scrypt-v1";
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_SALT_BYTES = 16;
const SCRYPT_COST = 16384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_MAX_MEMORY = 32 * 1024 * 1024;

function deriveScryptKey(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: {
    N: number;
    r: number;
    p: number;
    maxmem: number;
  }
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(Buffer.from(derivedKey));
    });
  });
}

function parseHash(value: string): {
  version: string;
  cost: number;
  blockSize: number;
  parallelization: number;
  salt: Buffer;
  digest: Buffer;
} | null {
  const parts = value.split("$");
  if (parts.length !== 6) {
    return null;
  }

  const [version, costRaw, blockSizeRaw, parallelizationRaw, saltRaw, digestRaw] =
    parts;

  const cost = Number.parseInt(costRaw, 10);
  const blockSize = Number.parseInt(blockSizeRaw, 10);
  const parallelization = Number.parseInt(parallelizationRaw, 10);

  if (
    !version ||
    !Number.isFinite(cost) ||
    !Number.isFinite(blockSize) ||
    !Number.isFinite(parallelization) ||
    !saltRaw ||
    !digestRaw
  ) {
    return null;
  }

  let salt: Buffer;
  let digest: Buffer;
  try {
    salt = Buffer.from(saltRaw, "base64url");
    digest = Buffer.from(digestRaw, "base64url");
  } catch {
    return null;
  }

  if (!salt.length || !digest.length) {
    return null;
  }

  return {
    version,
    cost,
    blockSize,
    parallelization,
    salt,
    digest,
  };
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(SCRYPT_SALT_BYTES);
  const derived = await deriveScryptKey(password, salt, SCRYPT_KEY_LENGTH, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION,
    maxmem: SCRYPT_MAX_MEMORY,
  });

  return [
    PASSWORD_HASH_VERSION,
    String(SCRYPT_COST),
    String(SCRYPT_BLOCK_SIZE),
    String(SCRYPT_PARALLELIZATION),
    salt.toString("base64url"),
    derived.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(
  password: string,
  passwordHash: string
): Promise<boolean> {
  const parsed = parseHash(passwordHash);
  if (!parsed || parsed.version !== PASSWORD_HASH_VERSION) {
    return false;
  }

  const derived = await deriveScryptKey(password, parsed.salt, parsed.digest.length, {
    N: parsed.cost,
    r: parsed.blockSize,
    p: parsed.parallelization,
    maxmem: SCRYPT_MAX_MEMORY,
  });

  if (derived.length !== parsed.digest.length) {
    return false;
  }

  return crypto.timingSafeEqual(derived, parsed.digest);
}
