-- TASK-058 collaboration invitation foundation.

CREATE TABLE "ProjectInvitation" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "invitedUserId" TEXT NOT NULL,
    "invitedByUserId" TEXT NOT NULL,
    "role" "ProjectMembershipRole" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectInvitation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProjectInvitation_role_non_owner_check" CHECK ("role" <> 'owner')
);

CREATE INDEX "ProjectInvitation_projectId_idx" ON "ProjectInvitation"("projectId");
CREATE INDEX "ProjectInvitation_invitedUserId_idx" ON "ProjectInvitation"("invitedUserId");
CREATE INDEX "ProjectInvitation_invitedByUserId_idx" ON "ProjectInvitation"("invitedByUserId");

CREATE UNIQUE INDEX "ProjectInvitation_active_project_user_key"
ON "ProjectInvitation"("projectId", "invitedUserId")
WHERE "acceptedAt" IS NULL AND "revokedAt" IS NULL;

ALTER TABLE "ProjectInvitation"
ADD CONSTRAINT "ProjectInvitation_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectInvitation"
ADD CONSTRAINT "ProjectInvitation_invitedUserId_fkey"
FOREIGN KEY ("invitedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectInvitation"
ADD CONSTRAINT "ProjectInvitation_invitedByUserId_fkey"
FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectInvitation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProjectInvitation" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_membership_insert_policy ON "ProjectMembership";

CREATE POLICY project_membership_insert_policy ON "ProjectMembership"
FOR INSERT
WITH CHECK (
  app.is_project_owner("projectId")
  OR (
    "userId" = app.current_user_id()
    AND EXISTS (
      SELECT 1
      FROM "ProjectInvitation" pi
      WHERE pi."projectId" = "ProjectMembership"."projectId"
        AND pi."invitedUserId" = app.current_user_id()
        AND pi."role" = "ProjectMembership"."role"
        AND pi."acceptedAt" IS NULL
        AND pi."revokedAt" IS NULL
        AND pi."expiresAt" > CURRENT_TIMESTAMP
    )
  )
);

CREATE POLICY project_invitation_select_policy ON "ProjectInvitation"
FOR SELECT
USING (
  "invitedUserId" = app.current_user_id()
  OR app.is_project_owner("projectId")
);

CREATE POLICY project_invitation_insert_policy ON "ProjectInvitation"
FOR INSERT
WITH CHECK (
  app.is_project_owner("projectId")
  AND "invitedByUserId" = app.current_user_id()
);

CREATE POLICY project_invitation_update_policy ON "ProjectInvitation"
FOR UPDATE
USING (
  "invitedUserId" = app.current_user_id()
  OR app.is_project_owner("projectId")
)
WITH CHECK (
  "invitedUserId" = app.current_user_id()
  OR app.is_project_owner("projectId")
);

CREATE POLICY project_invitation_delete_policy ON "ProjectInvitation"
FOR DELETE
USING (
  app.is_project_owner("projectId")
);
