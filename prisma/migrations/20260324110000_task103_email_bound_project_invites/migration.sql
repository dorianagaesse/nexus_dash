-- TASK-103 project sharing v2: email-bound invitations with replacement semantics.

ALTER TABLE "ProjectInvitation"
ADD COLUMN "invitedEmail" TEXT;

UPDATE "ProjectInvitation" pi
SET "invitedEmail" = LOWER(u.email)
FROM "User" u
WHERE pi."invitedUserId" = u.id;

ALTER TABLE "ProjectInvitation"
ALTER COLUMN "invitedEmail" SET NOT NULL;

ALTER TABLE "ProjectInvitation"
ADD COLUMN "replacedAt" TIMESTAMP(3);

DROP INDEX IF EXISTS "ProjectInvitation_active_project_user_key";
DROP INDEX IF EXISTS "ProjectInvitation_invitedUserId_idx";

ALTER TABLE "ProjectInvitation"
DROP CONSTRAINT IF EXISTS "ProjectInvitation_invitedUserId_fkey";

ALTER TABLE "ProjectInvitation"
DROP COLUMN "invitedUserId";

CREATE INDEX "ProjectInvitation_invitedEmail_idx" ON "ProjectInvitation"("invitedEmail");

CREATE UNIQUE INDEX "ProjectInvitation_active_project_email_key"
ON "ProjectInvitation"("projectId", "invitedEmail")
WHERE "acceptedAt" IS NULL AND "revokedAt" IS NULL AND "replacedAt" IS NULL;

CREATE OR REPLACE FUNCTION app.current_user_verified_email()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT LOWER(u.email)
  FROM "User" u
  WHERE u.id = app.current_user_id()
    AND u.email IS NOT NULL
    AND u."emailVerified" IS NOT NULL
  LIMIT 1;
$$;

DROP FUNCTION IF EXISTS app.can_owner_revoke_project_invitation(
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  "ProjectMembershipRole",
  TIMESTAMP(3),
  TIMESTAMP(3),
  TIMESTAMP(3)
);

CREATE OR REPLACE FUNCTION app.can_owner_revoke_project_invitation(
  invitation_id TEXT,
  project_id TEXT,
  invited_email TEXT,
  invited_by_user_id TEXT,
  invitation_role "ProjectMembershipRole",
  expires_at TIMESTAMP(3),
  accepted_at TIMESTAMP(3),
  revoked_at TIMESTAMP(3),
  replaced_at TIMESTAMP(3)
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT app.is_project_owner(project_id)
    AND accepted_at IS NULL
    AND (
      (revoked_at IS NOT NULL AND replaced_at IS NULL)
      OR (revoked_at IS NULL AND replaced_at IS NOT NULL)
    )
    AND EXISTS (
      SELECT 1
      FROM "ProjectInvitation" pi
      WHERE pi.id = invitation_id
        AND pi."projectId" = project_id
        AND pi."invitedEmail" = invited_email
        AND pi."invitedByUserId" = invited_by_user_id
        AND pi."role" = invitation_role
        AND pi."expiresAt" = expires_at
        AND pi."acceptedAt" IS NULL
        AND pi."revokedAt" IS NULL
        AND pi."replacedAt" IS NULL
    );
$$;

DROP FUNCTION IF EXISTS app.can_invitee_respond_to_project_invitation(
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  "ProjectMembershipRole",
  TIMESTAMP(3),
  TIMESTAMP(3),
  TIMESTAMP(3)
);

CREATE OR REPLACE FUNCTION app.can_invitee_respond_to_project_invitation(
  invitation_id TEXT,
  project_id TEXT,
  invited_email TEXT,
  invited_by_user_id TEXT,
  invitation_role "ProjectMembershipRole",
  expires_at TIMESTAMP(3),
  accepted_at TIMESTAMP(3),
  revoked_at TIMESTAMP(3),
  replaced_at TIMESTAMP(3)
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT invited_email = app.current_user_verified_email()
    AND replaced_at IS NULL
    AND (
      (accepted_at IS NOT NULL AND revoked_at IS NULL)
      OR (accepted_at IS NULL AND revoked_at IS NOT NULL)
    )
    AND EXISTS (
      SELECT 1
      FROM "ProjectInvitation" pi
      WHERE pi.id = invitation_id
        AND pi."projectId" = project_id
        AND pi."invitedEmail" = invited_email
        AND pi."invitedByUserId" = invited_by_user_id
        AND pi."role" = invitation_role
        AND pi."expiresAt" = expires_at
        AND pi."acceptedAt" IS NULL
        AND pi."revokedAt" IS NULL
        AND pi."replacedAt" IS NULL
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
        AND pi."invitedEmail" = app.current_user_verified_email()
        AND pi."role" = "ProjectMembership"."role"
        AND pi."acceptedAt" IS NULL
        AND pi."revokedAt" IS NULL
        AND pi."replacedAt" IS NULL
        AND pi."expiresAt" > CURRENT_TIMESTAMP
    )
  )
);

DROP POLICY IF EXISTS project_invitation_select_policy ON "ProjectInvitation";
DROP POLICY IF EXISTS project_invitation_insert_policy ON "ProjectInvitation";
DROP POLICY IF EXISTS project_invitation_owner_update_policy ON "ProjectInvitation";
DROP POLICY IF EXISTS project_invitation_invitee_update_policy ON "ProjectInvitation";
DROP POLICY IF EXISTS project_invitation_delete_policy ON "ProjectInvitation";

CREATE POLICY project_invitation_select_policy ON "ProjectInvitation"
FOR SELECT
USING (
  "invitedEmail" = app.current_user_verified_email()
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
  AND "replacedAt" IS NULL
)
WITH CHECK (
  app.can_owner_revoke_project_invitation(
    id,
    "projectId",
    "invitedEmail",
    "invitedByUserId",
    "role",
    "expiresAt",
    "acceptedAt",
    "revokedAt",
    "replacedAt"
  )
);

CREATE POLICY project_invitation_invitee_update_policy ON "ProjectInvitation"
FOR UPDATE
USING (
  "invitedEmail" = app.current_user_verified_email()
  AND "acceptedAt" IS NULL
  AND "revokedAt" IS NULL
  AND "replacedAt" IS NULL
)
WITH CHECK (
  app.can_invitee_respond_to_project_invitation(
    id,
    "projectId",
    "invitedEmail",
    "invitedByUserId",
    "role",
    "expiresAt",
    "acceptedAt",
    "revokedAt",
    "replacedAt"
  )
);

CREATE POLICY project_invitation_delete_policy ON "ProjectInvitation"
FOR DELETE
USING (
  app.is_project_owner("projectId")
);

DROP FUNCTION IF EXISTS app.list_pending_project_invitations_for_current_user();

CREATE OR REPLACE FUNCTION app.list_pending_project_invitations_for_current_user()
RETURNS TABLE (
  invitation_id TEXT,
  project_id TEXT,
  project_name TEXT,
  invited_email TEXT,
  invited_by_user_id TEXT,
  invited_by_email TEXT,
  invited_by_name TEXT,
  invited_by_username TEXT,
  invited_by_username_discriminator TEXT,
  invitation_role "ProjectMembershipRole",
  created_at TIMESTAMP(3),
  expires_at TIMESTAMP(3)
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    pi.id,
    pi."projectId",
    p.name,
    pi."invitedEmail",
    pi."invitedByUserId",
    invited_by.email,
    invited_by.name,
    invited_by.username,
    invited_by."usernameDiscriminator",
    pi."role",
    pi."createdAt",
    pi."expiresAt"
  FROM "ProjectInvitation" pi
  INNER JOIN "Project" p ON p.id = pi."projectId"
  INNER JOIN "User" invited_by ON invited_by.id = pi."invitedByUserId"
  WHERE pi."invitedEmail" = app.current_user_verified_email()
    AND pi."acceptedAt" IS NULL
    AND pi."revokedAt" IS NULL
    AND pi."replacedAt" IS NULL
    AND pi."expiresAt" > CURRENT_TIMESTAMP
  ORDER BY pi."createdAt" DESC;
$$;

GRANT EXECUTE ON FUNCTION app.current_user_verified_email() TO PUBLIC;
GRANT EXECUTE ON FUNCTION app.can_owner_revoke_project_invitation(
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  "ProjectMembershipRole",
  TIMESTAMP(3),
  TIMESTAMP(3),
  TIMESTAMP(3),
  TIMESTAMP(3)
) TO PUBLIC;
GRANT EXECUTE ON FUNCTION app.can_invitee_respond_to_project_invitation(
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  "ProjectMembershipRole",
  TIMESTAMP(3),
  TIMESTAMP(3),
  TIMESTAMP(3),
  TIMESTAMP(3)
) TO PUBLIC;
GRANT EXECUTE ON FUNCTION app.list_pending_project_invitations_for_current_user() TO PUBLIC;
