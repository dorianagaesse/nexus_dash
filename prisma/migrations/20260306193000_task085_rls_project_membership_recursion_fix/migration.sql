-- Break recursive RLS dependency between "Project" and "ProjectMembership".
-- The original policies made both tables depend on each other, causing:
--   ERROR 42P17 infinite recursion detected in policy for relation "ProjectMembership"
-- when reading projects as a non-owner member.

CREATE OR REPLACE FUNCTION app.is_project_owner(project_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "Project" p
    WHERE p.id = project_id
      AND p."ownerId" = app.current_user_id()
  );
$$;

DROP POLICY IF EXISTS project_membership_select_policy ON "ProjectMembership";
DROP POLICY IF EXISTS project_membership_insert_policy ON "ProjectMembership";
DROP POLICY IF EXISTS project_membership_update_policy ON "ProjectMembership";
DROP POLICY IF EXISTS project_membership_delete_policy ON "ProjectMembership";

CREATE POLICY project_membership_select_policy ON "ProjectMembership"
FOR SELECT
USING (
  "userId" = app.current_user_id()
  OR app.is_project_owner("projectId")
);

CREATE POLICY project_membership_insert_policy ON "ProjectMembership"
FOR INSERT
WITH CHECK (
  app.is_project_owner("projectId")
);

CREATE POLICY project_membership_update_policy ON "ProjectMembership"
FOR UPDATE
USING (
  app.is_project_owner("projectId")
)
WITH CHECK (
  app.is_project_owner("projectId")
);

CREATE POLICY project_membership_delete_policy ON "ProjectMembership"
FOR DELETE
USING (
  app.is_project_owner("projectId")
);
