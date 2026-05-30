CREATE OR REPLACE FUNCTION app.touch_project_activity(project_id TEXT, activity_at TIMESTAMPTZ DEFAULT now())
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app
AS $$
DECLARE
  actor_user_id TEXT;
  touched_at TIMESTAMPTZ;
BEGIN
  actor_user_id := app.current_user_id();

  IF actor_user_id IS NULL THEN
    RAISE EXCEPTION 'project activity touch requires an authenticated actor'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "Project" p
    WHERE p.id = project_id
      AND (
        p."ownerId" = actor_user_id
        OR EXISTS (
          SELECT 1
          FROM "ProjectMembership" pm
          WHERE pm."projectId" = p.id
            AND pm."userId" = actor_user_id
            AND pm.role IN ('owner', 'editor')
        )
      )
  ) THEN
    RAISE EXCEPTION 'project activity touch forbidden'
      USING ERRCODE = '42501';
  END IF;

  UPDATE "Project"
  SET "updatedAt" = activity_at
  WHERE id = project_id
  RETURNING "updatedAt" INTO touched_at;

  RETURN touched_at;
END;
$$;

GRANT EXECUTE ON FUNCTION app.touch_project_activity(TEXT, TIMESTAMPTZ) TO PUBLIC;
