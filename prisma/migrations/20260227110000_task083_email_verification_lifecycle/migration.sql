-- TASK-083: email verification token lifecycle + legacy-user verification backfill.
CREATE TABLE "EmailVerificationToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key"
ON "EmailVerificationToken"("tokenHash");

CREATE INDEX "EmailVerificationToken_userId_createdAt_idx"
ON "EmailVerificationToken"("userId", "createdAt");

CREATE INDEX "EmailVerificationToken_userId_expiresAt_idx"
ON "EmailVerificationToken"("userId", "expiresAt");

ALTER TABLE "EmailVerificationToken"
ADD CONSTRAINT "EmailVerificationToken_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Avoid production lockout during rollout by marking all existing users as verified.
UPDATE "User"
SET "emailVerified" = COALESCE("emailVerified", NOW())
WHERE "emailVerified" IS NULL;
