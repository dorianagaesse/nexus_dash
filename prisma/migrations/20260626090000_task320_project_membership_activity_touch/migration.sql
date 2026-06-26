CREATE OR REPLACE FUNCTION app.touch_project_membership_activity(
  project_id TEXT,
  member_user_id TEXT,
  invitation_id TEXT,
  activity_at TIMESTAMPTZ DEFAULT now()
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_user_id TEXT;
  current_project_updated_at TIMESTAMP(3);
  requested_version TIMESTAMP(3);
  activity_version TIMESTAMP(3);
  touched_at TIMESTAMPTZ;
BEGIN
  actor_user_id := app.current_user_id();

  IF actor_user_id IS NULL THEN
    RAISE EXCEPTION 'project membership activity touch requires an authenticated actor'
      USING ERRCODE = '42501';
  END IF;

  IF member_user_id IS DISTINCT FROM actor_user_id THEN
    RAISE EXCEPTION 'project membership activity touch actor mismatch'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "ProjectInvitation" pi
    JOIN "User" u
      ON u.id = member_user_id
      AND u.email = pi."invitedEmail"
    JOIN "ProjectMembership" pm
      ON pm."projectId" = pi."projectId"
      AND pm."userId" = member_user_id
    WHERE pi.id = invitation_id
      AND pi."projectId" = project_id
      AND pi."acceptedAt" IS NOT NULL
      AND pi."revokedAt" IS NULL
      AND pi."replacedAt" IS NULL
  ) THEN
    RAISE EXCEPTION 'project membership activity touch forbidden'
      USING ERRCODE = '42501';
  END IF;

  SELECT p."updatedAt"
  INTO current_project_updated_at
  FROM "Project" p
  WHERE p.id = project_id
  FOR UPDATE;

  IF current_project_updated_at IS NULL THEN
    RAISE EXCEPTION 'project membership activity touch project not found'
      USING ERRCODE = '42501';
  END IF;

  requested_version := LEAST(
    activity_at::TIMESTAMP(3),
    clock_timestamp()::TIMESTAMP(3)
  );

  IF current_project_updated_at >= requested_version THEN
    activity_version := current_project_updated_at + INTERVAL '1 millisecond';
  ELSE
    activity_version := requested_version;
  END IF;

  UPDATE "Project"
  SET "updatedAt" = activity_version
  WHERE id = project_id
  RETURNING "updatedAt" INTO touched_at;

  RETURN touched_at;
END;
$$;

GRANT EXECUTE ON FUNCTION app.touch_project_membership_activity(
  TEXT,
  TEXT,
  TEXT,
  TIMESTAMPTZ
) TO PUBLIC;
