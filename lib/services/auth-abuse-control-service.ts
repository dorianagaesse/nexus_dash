import { createHash } from "node:crypto";

import { AuthRateLimitScope, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type DbClient = typeof prisma | Prisma.TransactionClient;

export { AuthRateLimitScope };

export interface AuthAbuseSignal {
  key: string;
  maxAttempts: number;
  windowMs: number;
  blockMs: number;
}

interface AuthAbuseAllowed {
  ok: true;
}

interface AuthAbuseLimited {
  ok: false;
  retryAfterSeconds: number;
}

export type AuthAbuseCheckResult = AuthAbuseAllowed | AuthAbuseLimited;

function hashRateLimitValue(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

function normalizeKeyValue(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

export function buildAuthRateLimitKey(
  namespace: string,
  value: string | null | undefined
): string | null {
  const normalizedValue = normalizeKeyValue(value);
  if (!normalizedValue) {
    return null;
  }

  return `${namespace}:${hashRateLimitValue(normalizedValue)}`;
}

export function buildCompositeAuthRateLimitKey(
  namespace: string,
  values: Array<string | null | undefined>
): string | null {
  const normalizedValues = values
    .map((value) => normalizeKeyValue(value))
    .filter((value): value is string => Boolean(value));

  if (normalizedValues.length !== values.length) {
    return null;
  }

  return `${namespace}:${hashRateLimitValue(normalizedValues.join("|"))}`;
}

function floorWindowStart(now: Date, windowMs: number): Date {
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
}

function resolveRetryAfterSeconds(blockedUntil: Date, now: Date): number {
  return Math.max(1, Math.ceil((blockedUntil.getTime() - now.getTime()) / 1000));
}

function validateSignals(signals: AuthAbuseSignal[]): AuthAbuseSignal[] {
  return signals.filter(
    (signal) =>
      signal.key.trim().length > 0 &&
      Number.isInteger(signal.maxAttempts) &&
      signal.maxAttempts > 0 &&
      Number.isInteger(signal.windowMs) &&
      signal.windowMs > 0 &&
      Number.isInteger(signal.blockMs) &&
      signal.blockMs > 0
  );
}

async function findActiveBlocks(input: {
  db: DbClient;
  scope: AuthRateLimitScope;
  signals: AuthAbuseSignal[];
  now: Date;
}): Promise<AuthAbuseCheckResult> {
  const keys = validateSignals(input.signals).map((signal) => signal.key);
  if (keys.length === 0) {
    return { ok: true };
  }

  const activeBlocks = await input.db.authRateLimitBucket.findMany({
    where: {
      scope: input.scope,
      key: {
        in: keys,
      },
      blockedUntil: {
        gt: input.now,
      },
    },
    select: {
      blockedUntil: true,
    },
  });

  if (activeBlocks.length === 0) {
    return { ok: true };
  }

  const latestBlockedUntil = activeBlocks.reduce((latest, row) => {
    if (!row.blockedUntil) {
      return latest;
    }

    if (!latest || row.blockedUntil.getTime() > latest.getTime()) {
      return row.blockedUntil;
    }

    return latest;
  }, null as Date | null);

  if (!latestBlockedUntil) {
    return { ok: true };
  }

  return {
    ok: false,
    retryAfterSeconds: resolveRetryAfterSeconds(latestBlockedUntil, input.now),
  };
}

async function incrementSignalBucket(input: {
  db: DbClient;
  scope: AuthRateLimitScope;
  signal: AuthAbuseSignal;
  now: Date;
}): Promise<{ blockedUntil: Date | null }> {
  const windowStart = floorWindowStart(input.now, input.signal.windowMs);
  const blockedUntil = new Date(input.now.getTime() + input.signal.blockMs);
  const rows = await input.db.$queryRaw<Array<{ blockedUntil: Date | null }>>(
    Prisma.sql`
      INSERT INTO "AuthRateLimitBucket" (
        "scope",
        "key",
        "windowStart",
        "attemptCount",
        "blockedUntil",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        CAST(${input.scope} AS "AuthRateLimitScope"),
        ${input.signal.key},
        ${windowStart},
        1,
        ${input.signal.maxAttempts <= 1 ? blockedUntil : null},
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT ("scope", "key", "windowStart")
      DO UPDATE SET
        "attemptCount" = "AuthRateLimitBucket"."attemptCount" + 1,
        "blockedUntil" = CASE
          WHEN "AuthRateLimitBucket"."attemptCount" + 1 >= ${input.signal.maxAttempts}
            THEN ${blockedUntil}
          ELSE "AuthRateLimitBucket"."blockedUntil"
        END,
        "updatedAt" = CURRENT_TIMESTAMP
      RETURNING "blockedUntil"
    `
  );

  return rows[0] ?? { blockedUntil: null };
}

export async function checkAuthAbuseControls(input: {
  scope: AuthRateLimitScope;
  signals: AuthAbuseSignal[];
  now?: Date;
  db?: DbClient;
}): Promise<AuthAbuseCheckResult> {
  const now = input.now ?? new Date();
  const db = input.db ?? prisma;
  return findActiveBlocks({
    db,
    scope: input.scope,
    signals: input.signals,
    now,
  });
}

export async function consumeAuthAbuseQuota(input: {
  scope: AuthRateLimitScope;
  signals: AuthAbuseSignal[];
  now?: Date;
  db?: DbClient;
}): Promise<AuthAbuseCheckResult> {
  const now = input.now ?? new Date();
  const db = input.db ?? prisma;
  const signals = validateSignals(input.signals);

  if (signals.length === 0) {
    return { ok: true };
  }

  const existingBlock = await findActiveBlocks({
    db,
    scope: input.scope,
    signals,
    now,
  });
  if (!existingBlock.ok) {
    return existingBlock;
  }

  const runIncrementSequence = async (transactionDb: DbClient) => {
    const results: Array<{ blockedUntil: Date | null }> = [];
    for (const signal of signals) {
      results.push(
        await incrementSignalBucket({
          db: transactionDb,
          scope: input.scope,
          signal,
          now,
        })
      );
    }

    return results;
  };

  const results =
    db === prisma
      ? await prisma.$transaction((transactionDb) => runIncrementSequence(transactionDb))
      : await runIncrementSequence(db);

  const newestBlock = results.reduce((latest, result) => {
    if (!result.blockedUntil || result.blockedUntil.getTime() <= now.getTime()) {
      return latest;
    }

    if (!latest || result.blockedUntil.getTime() > latest.getTime()) {
      return result.blockedUntil;
    }

    return latest;
  }, null as Date | null);

  if (!newestBlock) {
    return { ok: true };
  }

  return {
    ok: false,
    retryAfterSeconds: resolveRetryAfterSeconds(newestBlock, now),
  };
}

export async function registerAuthAbuseFailure(input: {
  scope: AuthRateLimitScope;
  signals: AuthAbuseSignal[];
  now?: Date;
  db?: DbClient;
}): Promise<AuthAbuseCheckResult> {
  return consumeAuthAbuseQuota(input);
}

export async function clearAuthAbuseControls(input: {
  scope: AuthRateLimitScope;
  keys: Array<string | null | undefined>;
  db?: DbClient;
}): Promise<void> {
  const db = input.db ?? prisma;
  const keys = input.keys
    .map((key) => normalizeKeyValue(key))
    .filter((key): key is string => Boolean(key));

  if (keys.length === 0) {
    return;
  }

  await db.authRateLimitBucket.deleteMany({
    where: {
      scope: input.scope,
      key: {
        in: keys,
      },
    },
  });
}
