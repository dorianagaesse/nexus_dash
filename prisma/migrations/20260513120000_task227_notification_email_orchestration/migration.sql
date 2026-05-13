ALTER TYPE "ProjectNotificationEmailStatus" ADD VALUE IF NOT EXISTS 'dispatching';
ALTER TYPE "ProjectNotificationEmailStatus" ADD VALUE IF NOT EXISTS 'superseded';

ALTER TABLE "ProjectNotificationEmail"
ADD COLUMN "groupingKey" VARCHAR(191),
ADD COLUMN "firstPendingNotificationAt" TIMESTAMP(3),
ADD COLUMN "latestPendingNotificationAt" TIMESTAMP(3),
ADD COLUMN "sendAfterAt" TIMESTAMP(3),
ADD COLUMN "maxSendAt" TIMESTAMP(3),
ADD COLUMN "claimToken" VARCHAR(64),
ADD COLUMN "claimedAt" TIMESTAMP(3),
ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastAttemptAt" TIMESTAMP(3);

UPDATE "ProjectNotificationEmail"
SET
  "groupingKey" =
    "kind"::text || ':' || "recipientUserId" || ':' || "projectId" || ':' || "sourceKey",
  "firstPendingNotificationAt" = "windowStartedAt",
  "latestPendingNotificationAt" = "latestNotificationAt",
  "sendAfterAt" = "windowEndedAt",
  "maxSendAt" = "windowEndedAt"
WHERE "groupingKey" IS NULL;

ALTER TABLE "ProjectNotificationEmail"
ALTER COLUMN "groupingKey" SET NOT NULL,
ALTER COLUMN "firstPendingNotificationAt" SET NOT NULL,
ALTER COLUMN "latestPendingNotificationAt" SET NOT NULL,
ALTER COLUMN "sendAfterAt" SET NOT NULL,
ALTER COLUMN "maxSendAt" SET NOT NULL;

ALTER TABLE "ProjectNotificationEmailItem"
ADD COLUMN "notificationUpdatedAt" TIMESTAMP(3),
ADD COLUMN "sourceFingerprint" VARCHAR(160);

UPDATE "ProjectNotificationEmailItem" item
SET
  "notificationUpdatedAt" = notification."updatedAt",
  "sourceFingerprint" = item."notificationId" || ':' || notification."updatedAt"::text
FROM "Notification" notification
WHERE notification."id" = item."notificationId";

CREATE INDEX "ProjectNotificationEmail_kind_status_sendAfterAt_idx"
ON "ProjectNotificationEmail"("kind", "status", "sendAfterAt");

CREATE INDEX "ProjectNotificationEmail_groupingKey_status_idx"
ON "ProjectNotificationEmail"("groupingKey", "status");

CREATE UNIQUE INDEX "ProjectNotificationEmail_active_groupingKey_key"
ON "ProjectNotificationEmail"("groupingKey")
WHERE "status" = 'pending';

CREATE INDEX "ProjectNotificationEmailItem_sourceFingerprint_idx"
ON "ProjectNotificationEmailItem"("sourceFingerprint");

DROP INDEX IF EXISTS "ProjectNotificationEmail_kind_status_createdAt_idx";
