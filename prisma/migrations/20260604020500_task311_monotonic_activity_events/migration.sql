CREATE OR REPLACE FUNCTION app.record_project_activity_event(
  project_id TEXT,
  actor_user_id TEXT,
  event_domain TEXT,
  event_action TEXT,
  entity_id TEXT,
  event_payload JSONB DEFAULT NULL,
  activity_at TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE (
  id TEXT,
  "projectId" TEXT,
  "actorUserId" TEXT,
  domain TEXT,
  action TEXT,
  "entityId" TEXT,
  version TIMESTAMP(3),
  payload JSONB,
  "createdAt" TIMESTAMP(3)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  current_actor_user_id TEXT;
  event_id TEXT;
  requested_version TIMESTAMP(3);
  event_version TIMESTAMP(3);
  event_created_at TIMESTAMP(3);
  current_project_updated_at TIMESTAMP(3);
BEGIN
  current_actor_user_id := app.current_user_id();

  IF current_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'project activity event requires an authenticated actor'
      USING ERRCODE = '42501';
  END IF;

  IF actor_user_id IS DISTINCT FROM current_actor_user_id THEN
    RAISE EXCEPTION 'project activity event actor mismatch'
      USING ERRCODE = '42501';
  END IF;

  SELECT p."updatedAt"
  INTO current_project_updated_at
  FROM "Project" p
  WHERE p.id = project_id
    AND (
      p."ownerId" = current_actor_user_id
      OR EXISTS (
        SELECT 1
        FROM "ProjectMembership" pm
        WHERE pm."projectId" = p.id
          AND pm."userId" = current_actor_user_id
          AND pm.role IN ('owner', 'editor')
      )
    )
  FOR UPDATE;

  IF current_project_updated_at IS NULL THEN
    RAISE EXCEPTION 'project activity event forbidden'
      USING ERRCODE = '42501';
  END IF;

  event_id := 'pae_' || replace(gen_random_uuid()::TEXT, '-', '');
  requested_version := activity_at::TIMESTAMP(3);
  event_created_at := clock_timestamp()::TIMESTAMP(3);

  IF current_project_updated_at >= requested_version THEN
    event_version := current_project_updated_at + INTERVAL '1 millisecond';
  ELSE
    event_version := requested_version;
  END IF;

  UPDATE "Project"
  SET "updatedAt" = event_version
  WHERE "Project".id = project_id;

  RETURN QUERY
  INSERT INTO "ProjectActivityEvent" (
    id,
    "projectId",
    "actorUserId",
    domain,
    action,
    "entityId",
    version,
    payload,
    "createdAt"
  )
  VALUES (
    event_id,
    project_id,
    actor_user_id,
    event_domain,
    event_action,
    entity_id,
    event_version,
    event_payload,
    event_created_at
  )
  RETURNING
    "ProjectActivityEvent".id,
    "ProjectActivityEvent"."projectId",
    "ProjectActivityEvent"."actorUserId",
    "ProjectActivityEvent".domain::TEXT,
    "ProjectActivityEvent".action::TEXT,
    "ProjectActivityEvent"."entityId"::TEXT,
    "ProjectActivityEvent".version,
    "ProjectActivityEvent".payload,
    "ProjectActivityEvent"."createdAt";
END;
$$;

CREATE INDEX IF NOT EXISTS "ProjectActivityEvent_projectId_version_createdAt_id_idx"
  ON "ProjectActivityEvent"("projectId", version, "createdAt", id);

GRANT EXECUTE ON FUNCTION app.record_project_activity_event(
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  JSONB,
  TIMESTAMPTZ
) TO PUBLIC;
