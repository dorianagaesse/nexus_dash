CREATE TABLE "Epic" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Epic_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Epic_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Epic_projectId_name_key" ON "Epic"("projectId", "name");
CREATE INDEX "Epic_projectId_updatedAt_idx" ON "Epic"("projectId", "updatedAt");

ALTER TABLE "Task"
ADD COLUMN "epicId" TEXT;

CREATE INDEX "Task_epicId_idx" ON "Task"("epicId");
CREATE INDEX "Task_projectId_epicId_idx" ON "Task"("projectId", "epicId");

ALTER TABLE "Task"
ADD CONSTRAINT "Task_epicId_fkey"
FOREIGN KEY ("epicId") REFERENCES "Epic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION app.enforce_task_epic_project()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  epic_project_id TEXT;
BEGIN
  IF NEW."epicId" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT e."projectId"
    INTO epic_project_id
  FROM "Epic" e
  WHERE e.id = NEW."epicId";

  IF epic_project_id IS NULL THEN
    RAISE EXCEPTION 'Epic must exist before linking';
  END IF;

  IF epic_project_id <> NEW."projectId" THEN
    RAISE EXCEPTION 'Epic must belong to the same project as the task';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_task_epic_project_trigger
BEFORE INSERT OR UPDATE ON "Task"
FOR EACH ROW
EXECUTE FUNCTION app.enforce_task_epic_project();

ALTER TABLE "Epic" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Epic" FORCE ROW LEVEL SECURITY;

CREATE POLICY epic_select_policy ON "Epic"
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM "Project" p
    WHERE p.id = "Epic"."projectId"
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

CREATE POLICY epic_insert_policy ON "Epic"
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM "Project" p
    WHERE p.id = "Epic"."projectId"
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

CREATE POLICY epic_update_policy ON "Epic"
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM "Project" p
    WHERE p.id = "Epic"."projectId"
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
    WHERE p.id = "Epic"."projectId"
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

CREATE POLICY epic_delete_policy ON "Epic"
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM "Project" p
    WHERE p.id = "Epic"."projectId"
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
