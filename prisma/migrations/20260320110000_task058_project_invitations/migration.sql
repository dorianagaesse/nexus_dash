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

CREATE OR REPLACE FUNCTION app.can_owner_revoke_project_invitation(
  invitation_id TEXT,
  project_id TEXT,
  invited_user_id TEXT,
  invited_by_user_id TEXT,
  invitation_role "ProjectMembershipRole",
  expires_at TIMESTAMP(3),
  accepted_at TIMESTAMP(3),
  revoked_at TIMESTAMP(3)
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT app.is_project_owner(project_id)
    AND accepted_at IS NULL
    AND revoked_at IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM "ProjectInvitation" pi
      WHERE pi.id = invitation_id
        AND pi."projectId" = project_id
        AND pi."invitedUserId" = invited_user_id
        AND pi."invitedByUserId" = invited_by_user_id
        AND pi."role" = invitation_role
        AND pi."expiresAt" = expires_at
        AND pi."acceptedAt" IS NULL
        AND pi."revokedAt" IS NULL
    );
$$;

CREATE OR REPLACE FUNCTION app.can_invitee_respond_to_project_invitation(
  invitation_id TEXT,
  project_id TEXT,
  invited_user_id TEXT,
  invited_by_user_id TEXT,
  invitation_role "ProjectMembershipRole",
  expires_at TIMESTAMP(3),
  accepted_at TIMESTAMP(3),
  revoked_at TIMESTAMP(3)
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT invited_user_id = app.current_user_id()
    AND (
      (accepted_at IS NOT NULL AND revoked_at IS NULL)
      OR (accepted_at IS NULL AND revoked_at IS NOT NULL)
    )
    AND EXISTS (
      SELECT 1
      FROM "ProjectInvitation" pi
      WHERE pi.id = invitation_id
        AND pi."projectId" = project_id
        AND pi."invitedUserId" = invited_user_id
        AND pi."invitedByUserId" = invited_by_user_id
        AND pi."role" = invitation_role
        AND pi."expiresAt" = expires_at
        AND pi."acceptedAt" IS NULL
        AND pi."revokedAt" IS NULL
    );
$$;

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

CREATE POLICY project_invitation_owner_update_policy ON "ProjectInvitation"
FOR UPDATE
USING (
  app.is_project_owner("projectId")
  AND "acceptedAt" IS NULL
  AND "revokedAt" IS NULL
)
WITH CHECK (
  app.can_owner_revoke_project_invitation(
    id,
    "projectId",
    "invitedUserId",
    "invitedByUserId",
    "role",
    "expiresAt",
    "acceptedAt",
    "revokedAt"
  )
);

CREATE POLICY project_invitation_invitee_update_policy ON "ProjectInvitation"
FOR UPDATE
USING (
  "invitedUserId" = app.current_user_id()
  AND "acceptedAt" IS NULL
  AND "revokedAt" IS NULL
)
WITH CHECK (
  app.can_invitee_respond_to_project_invitation(
    id,
    "projectId",
    "invitedUserId",
    "invitedByUserId",
    "role",
    "expiresAt",
    "acceptedAt",
    "revokedAt"
  )
);

CREATE POLICY project_invitation_delete_policy ON "ProjectInvitation"
FOR DELETE
USING (
  app.is_project_owner("projectId")
);
