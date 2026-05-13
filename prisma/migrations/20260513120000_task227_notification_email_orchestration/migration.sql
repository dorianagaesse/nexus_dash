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
    CASE
      WHEN "kind" = 'project_digest'
        THEN "kind"::text || ':' || "recipientUserId" || ':' || "projectId"
      WHEN "kind" = 'project_invitation_reminder'
        THEN "kind"::text || ':' || "recipientUserId" || ':' || "projectId" || ':' || "sourceKey"
      ELSE "kind"::text || ':' || "recipientUserId" || ':' || "projectId" || ':' || "sourceKey"
    END,
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
  "sourceFingerprint" =
    item."notificationId" || ':' ||
    to_char(notification."updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
FROM "Notification" notification
WHERE notification."id" = item."notificationId";

WITH ranked_pending_groups AS (
  SELECT
    "id",
    first_value("id") OVER (
      PARTITION BY "groupingKey"
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS "keeperId",
    row_number() OVER (
      PARTITION BY "groupingKey"
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS "rank"
  FROM "ProjectNotificationEmail"
  WHERE "status" = 'pending'
)
DELETE FROM "ProjectNotificationEmailItem" duplicate_item
USING ranked_pending_groups duplicate_group, "ProjectNotificationEmailItem" keeper_item
WHERE duplicate_group."rank" > 1
  AND duplicate_item."emailId" = duplicate_group."id"
  AND keeper_item."emailId" = duplicate_group."keeperId"
  AND keeper_item."notificationId" = duplicate_item."notificationId";

WITH ranked_pending_groups AS (
  SELECT
    "id",
    first_value("id") OVER (
      PARTITION BY "groupingKey"
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS "keeperId",
    row_number() OVER (
      PARTITION BY "groupingKey"
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS "rank"
  FROM "ProjectNotificationEmail"
  WHERE "status" = 'pending'
)
UPDATE "ProjectNotificationEmailItem" item
SET "emailId" = duplicate_group."keeperId"
FROM ranked_pending_groups duplicate_group
WHERE duplicate_group."rank" > 1
  AND item."emailId" = duplicate_group."id";

WITH group_rollups AS (
  SELECT
    email."id",
    COUNT(item."id")::integer AS "notificationCount",
    MIN(COALESCE(notification."updatedAt", email."firstPendingNotificationAt")) AS "firstPendingNotificationAt",
    MAX(COALESCE(notification."updatedAt", email."latestPendingNotificationAt")) AS "latestPendingNotificationAt"
  FROM "ProjectNotificationEmail" email
  LEFT JOIN "ProjectNotificationEmailItem" item ON item."emailId" = email."id"
  LEFT JOIN "Notification" notification ON notification."id" = item."notificationId"
  WHERE email."status" = 'pending'
  GROUP BY email."id"
)
UPDATE "ProjectNotificationEmail" email
SET
  "notificationCount" = group_rollups."notificationCount",
  "firstPendingNotificationAt" = group_rollups."firstPendingNotificationAt",
  "latestPendingNotificationAt" = group_rollups."latestPendingNotificationAt",
  "windowStartedAt" = group_rollups."firstPendingNotificationAt",
  "windowEndedAt" = group_rollups."latestPendingNotificationAt",
  "latestNotificationAt" = group_rollups."latestPendingNotificationAt"
FROM group_rollups
WHERE email."id" = group_rollups."id";

WITH ranked_pending_groups AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "groupingKey"
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS "rank"
  FROM "ProjectNotificationEmail"
  WHERE "status" = 'pending'
)
UPDATE "ProjectNotificationEmail" email
SET
  "status" = 'superseded',
  "errorCode" = 'superseded-by-grouping-key',
  "completedAt" = NOW()
FROM ranked_pending_groups duplicate_group
WHERE duplicate_group."rank" > 1
  AND email."id" = duplicate_group."id";

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
