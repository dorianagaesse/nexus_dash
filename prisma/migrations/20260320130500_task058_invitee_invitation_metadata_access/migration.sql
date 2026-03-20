-- TASK-058 invitee-safe pending invitation metadata reads.

CREATE OR REPLACE FUNCTION app.list_pending_project_invitations_for_current_user()
RETURNS TABLE (
  invitation_id TEXT,
  project_id TEXT,
  project_name TEXT,
  invited_user_id TEXT,
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
    pi."invitedUserId",
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
  WHERE pi."invitedUserId" = app.current_user_id()
    AND pi."acceptedAt" IS NULL
    AND pi."revokedAt" IS NULL
    AND pi."expiresAt" > CURRENT_TIMESTAMP
  ORDER BY pi."createdAt" DESC;
$$;
