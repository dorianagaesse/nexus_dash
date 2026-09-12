CREATE OR REPLACE FUNCTION app.transfer_project_ownership(
  current_owner_id TEXT,
  target_project_id TEXT,
  next_owner_id TEXT,
  previous_owner_leaves BOOLEAN
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  stored_owner_id TEXT;
BEGIN
  IF app.current_user_id() IS DISTINCT FROM current_owner_id THEN
    RETURN 'forbidden';
  END IF;

  SELECT project."ownerId"
  INTO stored_owner_id
  FROM "Project" project
  WHERE project.id = target_project_id
  FOR UPDATE;

  IF stored_owner_id IS NULL THEN
    RETURN 'project-not-found';
  END IF;
  IF stored_owner_id IS DISTINCT FROM current_owner_id THEN
    RETURN 'forbidden';
  END IF;
  IF next_owner_id = current_owner_id THEN
    RETURN 'same-owner';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM "ProjectMembership" membership
    WHERE membership."projectId" = target_project_id
      AND membership."userId" = next_owner_id
  ) THEN
    RETURN 'new-owner-not-member';
  END IF;

  UPDATE "ProjectMembership"
  SET role = 'editor', "updatedAt" = CURRENT_TIMESTAMP
  WHERE "projectId" = target_project_id
    AND role = 'owner'
    AND "userId" <> next_owner_id;

  UPDATE "ProjectMembership"
  SET role = 'owner', "updatedAt" = CURRENT_TIMESTAMP
  WHERE "projectId" = target_project_id
    AND "userId" = next_owner_id;

  IF previous_owner_leaves THEN
    DELETE FROM "ProjectMembership"
    WHERE "projectId" = target_project_id
      AND "userId" = current_owner_id;
  ELSE
    INSERT INTO "ProjectMembership" (
      id,
      "projectId",
      "userId",
      role,
      "createdAt",
      "updatedAt"
    )
    VALUES (
      'ownership_' || md5(target_project_id || ':' || current_owner_id),
      target_project_id,
      current_owner_id,
      'editor',
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT ("projectId", "userId") DO UPDATE
      SET role = 'editor', "updatedAt" = CURRENT_TIMESTAMP;
  END IF;

  UPDATE "Project"
  SET "ownerId" = next_owner_id, "updatedAt" = CURRENT_TIMESTAMP
  WHERE id = target_project_id;

  RETURN 'ok';
END;
$$;

REVOKE ALL ON FUNCTION app.transfer_project_ownership(TEXT, TEXT, TEXT, BOOLEAN)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.transfer_project_ownership(TEXT, TEXT, TEXT, BOOLEAN)
TO postgres;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    GRANT EXECUTE ON FUNCTION app.transfer_project_ownership(TEXT, TEXT, TEXT, BOOLEAN)
    TO app_runtime;
  END IF;
END;
$$;
