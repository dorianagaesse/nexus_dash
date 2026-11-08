-- Run as the migration/admin role during a write maintenance window.
-- Transactional DDL: a failure restores the entire pre-migration state.
BEGIN;
LOCK TABLE "Project", "Task", "ProjectActivityEvent" IN ACCESS EXCLUSIVE MODE;

CREATE TEMP TABLE nd536_task_snapshot ON COMMIT DROP AS
SELECT id, "projectId", "referenceNumber" AS legacy,
       row_number() OVER (PARTITION BY "projectId" ORDER BY "createdAt", id)::integer AS local
FROM "Task";

ALTER TABLE "Task" ADD COLUMN "legacyReferenceNumber" INTEGER;
ALTER TABLE "Task" ALTER COLUMN "referenceNumber" DROP DEFAULT;
DROP INDEX "Task_referenceNumber_key";
DROP SEQUENCE "Task_referenceNumber_seq";

UPDATE "Task" t SET "legacyReferenceNumber" = s.legacy, "referenceNumber" = s.local
FROM nd536_task_snapshot s WHERE t.id = s.id;

-- Replay snapshots contain rendered ND references. Preserve event identity and
-- metadata, but force their consumers to reload instead of restoring old labels.
UPDATE "ProjectActivityEvent" SET payload = NULL
WHERE domain = 'task' AND payload ? 'task';
-- Existing tabs also need a new snapshot version even if nobody edits a task.
UPDATE "Project" p SET "updatedAt" = GREATEST(p."updatedAt" + interval '1 millisecond', clock_timestamp())
WHERE EXISTS (SELECT 1 FROM "Task" t WHERE t."projectId" = p.id);

CREATE UNIQUE INDEX "Task_legacyReferenceNumber_key" ON "Task"("legacyReferenceNumber");
CREATE UNIQUE INDEX "Task_projectId_referenceNumber_key" ON "Task"("projectId", "referenceNumber");
ALTER TABLE "Task" ADD CONSTRAINT "Task_referenceNumber_positive" CHECK ("referenceNumber" > 0);

CREATE TABLE "TaskReferenceCounter" (
  "projectId" TEXT PRIMARY KEY REFERENCES "Project"(id) ON DELETE CASCADE ON UPDATE CASCADE,
  "nextNumber" INTEGER NOT NULL DEFAULT 1 CHECK ("nextNumber" > 0)
);
INSERT INTO "TaskReferenceCounter" ("projectId", "nextNumber")
SELECT p.id, (count(t.id) + 1)::integer FROM "Project" p
LEFT JOIN "Task" t ON t."projectId" = p.id GROUP BY p.id;

DO $$
DECLARE before_count bigint; after_count bigint;
BEGIN
  SELECT count(*) INTO before_count FROM nd536_task_snapshot;
  SELECT count(*) INTO after_count FROM "Task";
  IF before_count <> after_count OR EXISTS (
    SELECT 1 FROM nd536_task_snapshot s LEFT JOIN "Task" t ON t.id = s.id
    WHERE t.id IS NULL OR t."projectId" <> s."projectId"
       OR t."referenceNumber" <> s.local OR t."legacyReferenceNumber" <> s.legacy
  ) OR EXISTS (
    SELECT 1 FROM "TaskReferenceCounter" c
    WHERE c."nextNumber" <> (SELECT count(*) + 1 FROM "Task" t WHERE t."projectId" = c."projectId")
  ) THEN
    RAISE EXCEPTION 'ND-536 snapshot verification failed';
  END IF;
  RAISE NOTICE 'ND-536 verified: before=%, after=%, project-local and legacy uniqueness enforced', before_count, after_count;
END $$;

ALTER TABLE "TaskReferenceCounter" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TaskReferenceCounter" FORCE ROW LEVEL SECURITY;
CREATE POLICY task_reference_counter_access ON "TaskReferenceCounter"
FOR ALL USING (
  EXISTS (SELECT 1 FROM "Project" p WHERE p.id = "projectId" AND (
    p."ownerId" = app.current_user_id() OR EXISTS (
      SELECT 1 FROM "ProjectMembership" pm WHERE pm."projectId" = p.id
      AND pm."userId" = app.current_user_id() AND pm.role IN ('owner', 'editor')
    )
  ))
) WITH CHECK (
  EXISTS (SELECT 1 FROM "Project" p WHERE p.id = "projectId" AND (
    p."ownerId" = app.current_user_id() OR EXISTS (
      SELECT 1 FROM "ProjectMembership" pm WHERE pm."projectId" = p.id
      AND pm."userId" = app.current_user_id() AND pm.role IN ('owner', 'editor')
    )
  ))
);
-- Counter lifetime follows the project; deleting tasks never resets it.
CREATE POLICY task_reference_counter_no_delete ON "TaskReferenceCounter"
AS RESTRICTIVE FOR DELETE USING (false);

-- SECURITY INVOKER deliberately preserves tenant RLS. Row locking in the
-- upsert serializes only this project's creates and rolls back with the task.
CREATE FUNCTION app.allocate_task_reference() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW."referenceNumber" IS NOT NULL OR NEW."legacyReferenceNumber" IS NOT NULL THEN
    RAISE EXCEPTION 'Task references are allocated by the database' USING ERRCODE = '23514';
  END IF;
  INSERT INTO public."TaskReferenceCounter" ("projectId", "nextNumber")
  VALUES (NEW."projectId", 2)
  ON CONFLICT ("projectId") DO UPDATE
  SET "nextNumber" = "TaskReferenceCounter"."nextNumber" + 1
  RETURNING "nextNumber" - 1 INTO NEW."referenceNumber";
  RETURN NEW;
END $$;
CREATE TRIGGER task_allocate_reference BEFORE INSERT ON "Task"
FOR EACH ROW EXECUTE FUNCTION app.allocate_task_reference();

CREATE FUNCTION app.preserve_task_reference() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW."projectId" IS DISTINCT FROM OLD."projectId"
     OR NEW."referenceNumber" IS DISTINCT FROM OLD."referenceNumber"
     OR NEW."legacyReferenceNumber" IS DISTINCT FROM OLD."legacyReferenceNumber" THEN
    RAISE EXCEPTION 'Task identity and references are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER task_preserve_reference BEFORE UPDATE ON "Task"
FOR EACH ROW EXECUTE FUNCTION app.preserve_task_reference();

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    GRANT SELECT, INSERT, UPDATE ON "TaskReferenceCounter" TO app_runtime;
  END IF;
END $$;
COMMIT;
