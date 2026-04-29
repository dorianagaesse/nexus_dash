CREATE TABLE "Notification" (
  "id" TEXT NOT NULL,
  "recipientUserId" TEXT NOT NULL,
  "type" VARCHAR(80) NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "body" TEXT,
  "targetPath" TEXT,
  "sourceType" VARCHAR(80) NOT NULL,
  "sourceId" VARCHAR(128) NOT NULL,
  "metadata" JSONB,
  "readAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Notification_recipientUserId_sourceType_sourceId_key"
ON "Notification"("recipientUserId", "sourceType", "sourceId");

CREATE INDEX "Notification_recipientUserId_createdAt_idx"
ON "Notification"("recipientUserId", "createdAt");

CREATE INDEX "Notification_recipientUserId_readAt_idx"
ON "Notification"("recipientUserId", "readAt");

CREATE INDEX "Notification_recipientUserId_resolvedAt_idx"
ON "Notification"("recipientUserId", "resolvedAt");

CREATE INDEX "Notification_type_idx" ON "Notification"("type");

ALTER TABLE "Notification"
ADD CONSTRAINT "Notification_recipientUserId_fkey"
FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notification" FORCE ROW LEVEL SECURITY;

CREATE POLICY notification_select_policy ON "Notification"
FOR SELECT
USING (
  "recipientUserId" = app.current_user_id()
);

CREATE POLICY notification_insert_policy ON "Notification"
FOR INSERT
WITH CHECK (
  "recipientUserId" = app.current_user_id()
  OR (
    "sourceType" = 'project_invitation'
    AND EXISTS (
      SELECT 1
      FROM "ProjectInvitation" pi
      JOIN "User" recipient_user
        ON recipient_user.id = "Notification"."recipientUserId"
      WHERE pi.id = "Notification"."sourceId"
        AND pi."invitedByUserId" = app.current_user_id()
        AND recipient_user.email IS NOT NULL
        AND pi."invitedEmail" = recipient_user.email
    )
  )
);

CREATE POLICY notification_update_policy ON "Notification"
FOR UPDATE
USING (
  "recipientUserId" = app.current_user_id()
  OR (
    "sourceType" = 'project_invitation'
    AND EXISTS (
      SELECT 1
      FROM "ProjectInvitation" pi
      WHERE pi.id = "Notification"."sourceId"
        AND pi."invitedByUserId" = app.current_user_id()
    )
  )
)
WITH CHECK (
  "recipientUserId" = app.current_user_id()
  OR (
    "sourceType" = 'project_invitation'
    AND EXISTS (
      SELECT 1
      FROM "ProjectInvitation" pi
      WHERE pi.id = "Notification"."sourceId"
        AND pi."invitedByUserId" = app.current_user_id()
    )
  )
);

CREATE POLICY notification_delete_policy ON "Notification"
FOR DELETE
USING (
  "recipientUserId" = app.current_user_id()
);
