CREATE TYPE "ProjectNotificationEmailKind" AS ENUM (
  'project_digest',
  'project_invitation_reminder'
);

CREATE TYPE "ProjectNotificationEmailStatus" AS ENUM (
  'pending',
  'sent',
  'skipped',
  'failed'
);

CREATE TABLE "ProjectNotificationEmail" (
  "id" TEXT NOT NULL,
  "kind" "ProjectNotificationEmailKind" NOT NULL,
  "recipientUserId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "sourceKey" VARCHAR(128) NOT NULL,
  "windowStartedAt" TIMESTAMP(3) NOT NULL,
  "windowEndedAt" TIMESTAMP(3) NOT NULL,
  "latestNotificationAt" TIMESTAMP(3) NOT NULL,
  "notificationCount" INTEGER NOT NULL,
  "status" "ProjectNotificationEmailStatus" NOT NULL DEFAULT 'pending',
  "outboundEmailDeliveryId" TEXT,
  "errorCode" VARCHAR(80),
  "metadata" JSONB,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProjectNotificationEmail_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectNotificationEmailItem" (
  "id" TEXT NOT NULL,
  "emailId" TEXT NOT NULL,
  "notificationId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProjectNotificationEmailItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectNotificationEmail_kind_recipientUserId_projectId_sourceKey_key"
ON "ProjectNotificationEmail"("kind", "recipientUserId", "projectId", "sourceKey");

CREATE INDEX "ProjectNotificationEmail_recipientUserId_projectId_createdAt_idx"
ON "ProjectNotificationEmail"("recipientUserId", "projectId", "createdAt");

CREATE INDEX "ProjectNotificationEmail_kind_status_createdAt_idx"
ON "ProjectNotificationEmail"("kind", "status", "createdAt");

CREATE INDEX "ProjectNotificationEmail_outboundEmailDeliveryId_idx"
ON "ProjectNotificationEmail"("outboundEmailDeliveryId");

CREATE UNIQUE INDEX "ProjectNotificationEmailItem_emailId_notificationId_key"
ON "ProjectNotificationEmailItem"("emailId", "notificationId");

CREATE INDEX "ProjectNotificationEmailItem_notificationId_idx"
ON "ProjectNotificationEmailItem"("notificationId");

ALTER TABLE "ProjectNotificationEmail"
ADD CONSTRAINT "ProjectNotificationEmail_recipientUserId_fkey"
FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectNotificationEmail"
ADD CONSTRAINT "ProjectNotificationEmail_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectNotificationEmail"
ADD CONSTRAINT "ProjectNotificationEmail_outboundEmailDeliveryId_fkey"
FOREIGN KEY ("outboundEmailDeliveryId") REFERENCES "OutboundEmailDelivery"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProjectNotificationEmailItem"
ADD CONSTRAINT "ProjectNotificationEmailItem_emailId_fkey"
FOREIGN KEY ("emailId") REFERENCES "ProjectNotificationEmail"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectNotificationEmailItem"
ADD CONSTRAINT "ProjectNotificationEmailItem_notificationId_fkey"
FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
