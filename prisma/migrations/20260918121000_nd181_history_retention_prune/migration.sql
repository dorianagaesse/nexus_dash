-- ND-181: retention pruning for durable project history.
-- ProjectActivityEvent is FORCE RLS with SELECT/INSERT policies only, so the
-- system-wide sweep runs as a SECURITY DEFINER function owned by the migration
-- role (which bypasses RLS) instead of relying on a runtime DELETE policy that
-- would need an actor context this maintenance job does not have.
CREATE OR REPLACE FUNCTION app.prune_project_activity_events(
  cutoff TIMESTAMPTZ,
  batch_limit INTEGER DEFAULT 500
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  IF cutoff IS NULL THEN
    RAISE EXCEPTION 'project activity retention cutoff is required'
      USING ERRCODE = '22004';
  END IF;

  IF batch_limit IS NULL OR batch_limit < 1 OR batch_limit > 10000 THEN
    RAISE EXCEPTION 'project activity retention batch limit is out of range'
      USING ERRCODE = '22023';
  END IF;

  WITH doomed AS (
    SELECT "id"
    FROM "ProjectActivityEvent"
    WHERE "createdAt" < cutoff
    ORDER BY "createdAt" ASC
    LIMIT batch_limit
  )
  DELETE FROM "ProjectActivityEvent" event
  USING doomed
  WHERE event."id" = doomed."id";

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION app.prune_project_activity_events(TIMESTAMPTZ, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.prune_project_activity_events(TIMESTAMPTZ, INTEGER) TO PUBLIC;
