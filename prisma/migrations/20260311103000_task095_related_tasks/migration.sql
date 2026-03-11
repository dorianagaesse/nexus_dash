-- Add symmetric related-task links within a single project.
-- A canonical pair (`leftTaskId` < `rightTaskId`) keeps the relation bidirectional
-- without duplicate rows, and the trigger enforces same-project integrity.

CREATE TABLE "TaskRelation" (
    "leftTaskId" TEXT NOT NULL,
    "rightTaskId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskRelation_pkey" PRIMARY KEY ("leftTaskId", "rightTaskId"),
    CONSTRAINT "TaskRelation_leftTaskId_fkey" FOREIGN KEY ("leftTaskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskRelation_rightTaskId_fkey" FOREIGN KEY ("rightTaskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskRelation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskRelation_canonical_pair_check" CHECK ("leftTaskId" < "rightTaskId")
);

CREATE INDEX "TaskRelation_projectId_idx" ON "TaskRelation"("projectId");
CREATE INDEX "TaskRelation_rightTaskId_idx" ON "TaskRelation"("rightTaskId");

CREATE OR REPLACE FUNCTION app.enforce_task_relation_project()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  left_project_id TEXT;
  right_project_id TEXT;
BEGIN
  SELECT t."projectId"
    INTO left_project_id
  FROM "Task" t
  WHERE t.id = NEW."leftTaskId";

  SELECT t."projectId"
    INTO right_project_id
  FROM "Task" t
  WHERE t.id = NEW."rightTaskId";

  IF left_project_id IS NULL OR right_project_id IS NULL THEN
    RAISE EXCEPTION 'Related tasks must exist before linking';
  END IF;

  IF left_project_id <> right_project_id OR left_project_id <> NEW."projectId" THEN
    RAISE EXCEPTION 'Related tasks must belong to the same project';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_task_relation_project_trigger
BEFORE INSERT OR UPDATE ON "TaskRelation"
FOR EACH ROW
EXECUTE FUNCTION app.enforce_task_relation_project();

ALTER TABLE "TaskRelation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TaskRelation" FORCE ROW LEVEL SECURITY;

CREATE POLICY task_relation_select_policy ON "TaskRelation"
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM "Project" p
    WHERE p.id = "TaskRelation"."projectId"
      AND (
        p."ownerId" = app.current_user_id()
        OR EXISTS (
          SELECT 1
          FROM "ProjectMembership" pm
          WHERE pm."projectId" = p.id
            AND pm."userId" = app.current_user_id()
        )
      )
  )
);

CREATE POLICY task_relation_insert_policy ON "TaskRelation"
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM "Project" p
    WHERE p.id = "TaskRelation"."projectId"
      AND (
        p."ownerId" = app.current_user_id()
        OR EXISTS (
          SELECT 1
          FROM "ProjectMembership" pm
          WHERE pm."projectId" = p.id
            AND pm."userId" = app.current_user_id()
            AND pm.role IN ('owner', 'editor')
        )
      )
  )
);

CREATE POLICY task_relation_update_policy ON "TaskRelation"
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM "Project" p
    WHERE p.id = "TaskRelation"."projectId"
      AND (
        p."ownerId" = app.current_user_id()
        OR EXISTS (
          SELECT 1
          FROM "ProjectMembership" pm
          WHERE pm."projectId" = p.id
            AND pm."userId" = app.current_user_id()
            AND pm.role IN ('owner', 'editor')
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM "Project" p
    WHERE p.id = "TaskRelation"."projectId"
      AND (
        p."ownerId" = app.current_user_id()
        OR EXISTS (
          SELECT 1
          FROM "ProjectMembership" pm
          WHERE pm."projectId" = p.id
            AND pm."userId" = app.current_user_id()
            AND pm.role IN ('owner', 'editor')
        )
      )
  )
);

CREATE POLICY task_relation_delete_policy ON "TaskRelation"
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM "Project" p
    WHERE p.id = "TaskRelation"."projectId"
      AND (
        p."ownerId" = app.current_user_id()
        OR EXISTS (
          SELECT 1
          FROM "ProjectMembership" pm
          WHERE pm."projectId" = p.id
            AND pm."userId" = app.current_user_id()
            AND pm.role IN ('owner', 'editor')
        )
      )
  )
);
