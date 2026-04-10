DELETE FROM "Session";

ALTER TABLE "Session" RENAME COLUMN "sessionToken" TO "sessionTokenHash";
ALTER INDEX "Session_sessionToken_key" RENAME TO "Session_sessionTokenHash_key";

ALTER TYPE "AuthAuditAction" ADD VALUE 'token_exchange_failed';

CREATE TYPE "AuthRateLimitScope" AS ENUM (
  'sign_in',
  'sign_up',
  'password_reset',
  'verification_resend',
  'agent_token_exchange'
);

CREATE TABLE "AuthRateLimitBucket" (
  "scope" "AuthRateLimitScope" NOT NULL,
  "key" VARCHAR(191) NOT NULL,
  "windowStart" TIMESTAMPTZ(6) NOT NULL,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "blockedUntil" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "AuthRateLimitBucket_pkey" PRIMARY KEY ("scope", "key", "windowStart")
);

CREATE INDEX "AuthRateLimitBucket_scope_key_blockedUntil_idx"
  ON "AuthRateLimitBucket"("scope", "key", "blockedUntil");

CREATE INDEX "AuthRateLimitBucket_createdAt_idx"
  ON "AuthRateLimitBucket"("createdAt");
