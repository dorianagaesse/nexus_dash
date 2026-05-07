CREATE TYPE "OutboundEmailDeliveryStatus" AS ENUM (
  'pending',
  'sent',
  'skipped',
  'failed'
);

CREATE TABLE "OutboundEmailDelivery" (
  "id" TEXT NOT NULL,
  "templateKey" VARCHAR(80) NOT NULL,
  "provider" VARCHAR(40) NOT NULL,
  "fromEmail" TEXT NOT NULL,
  "recipientEmail" TEXT NOT NULL,
  "subject" VARCHAR(240) NOT NULL,
  "status" "OutboundEmailDeliveryStatus" NOT NULL DEFAULT 'pending',
  "providerMessageId" VARCHAR(128),
  "providerStatus" INTEGER,
  "errorCode" VARCHAR(80),
  "errorMessage" TEXT,
  "metadata" JSONB,
  "lastAttemptAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OutboundEmailDelivery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OutboundEmailDelivery_recipientEmail_createdAt_idx"
ON "OutboundEmailDelivery"("recipientEmail", "createdAt");

CREATE INDEX "OutboundEmailDelivery_templateKey_createdAt_idx"
ON "OutboundEmailDelivery"("templateKey", "createdAt");

CREATE INDEX "OutboundEmailDelivery_status_createdAt_idx"
ON "OutboundEmailDelivery"("status", "createdAt");

CREATE INDEX "OutboundEmailDelivery_providerMessageId_idx"
ON "OutboundEmailDelivery"("providerMessageId");
