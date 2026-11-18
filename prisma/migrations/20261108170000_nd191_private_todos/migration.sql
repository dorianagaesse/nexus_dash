-- Forward-only correction of ND-191: standalone todos belong only to their
-- human creator. Project owners have no override; orphaned rows stay hidden.
DROP POLICY project_todo_select ON "ProjectTodo";
DROP POLICY project_todo_insert ON "ProjectTodo";
DROP POLICY project_todo_update ON "ProjectTodo";
DROP POLICY project_todo_delete ON "ProjectTodo";

CREATE POLICY project_todo_select ON "ProjectTodo" FOR SELECT
USING (
  "createdByUserId" = app.current_user_id()
  AND COALESCE(NULLIF(current_setting('app.actor_kind', true), ''), 'human') = 'human'
  AND EXISTS (SELECT 1 FROM "Project" p WHERE p.id = "ProjectTodo"."projectId"
    AND (p."ownerId" = app.current_user_id() OR EXISTS (
      SELECT 1 FROM "ProjectMembership" pm WHERE pm."projectId" = p.id
      AND pm."userId" = app.current_user_id())))
);

CREATE POLICY project_todo_insert ON "ProjectTodo" FOR INSERT
WITH CHECK (
  "createdByUserId" = app.current_user_id()
  AND COALESCE(NULLIF(current_setting('app.actor_kind', true), ''), 'human') = 'human'
  AND EXISTS (SELECT 1 FROM "Project" p WHERE p.id = "ProjectTodo"."projectId"
    AND (p."ownerId" = app.current_user_id() OR EXISTS (
      SELECT 1 FROM "ProjectMembership" pm WHERE pm."projectId" = p.id
      AND pm."userId" = app.current_user_id() AND pm.role IN ('owner', 'editor'))))
);

CREATE POLICY project_todo_update ON "ProjectTodo" FOR UPDATE
USING (
  "createdByUserId" = app.current_user_id()
  AND COALESCE(NULLIF(current_setting('app.actor_kind', true), ''), 'human') = 'human'
  AND EXISTS (SELECT 1 FROM "Project" p WHERE p.id = "ProjectTodo"."projectId"
    AND (p."ownerId" = app.current_user_id() OR EXISTS (
      SELECT 1 FROM "ProjectMembership" pm WHERE pm."projectId" = p.id
      AND pm."userId" = app.current_user_id() AND pm.role IN ('owner', 'editor'))))
)
WITH CHECK (
  "createdByUserId" = app.current_user_id()
  AND EXISTS (SELECT 1 FROM "Project" p WHERE p.id = "ProjectTodo"."projectId"
    AND (p."ownerId" = app.current_user_id() OR EXISTS (
      SELECT 1 FROM "ProjectMembership" pm WHERE pm."projectId" = p.id
      AND pm."userId" = app.current_user_id() AND pm.role IN ('owner', 'editor'))))
);

CREATE POLICY project_todo_delete ON "ProjectTodo" FOR DELETE
USING (
  "createdByUserId" = app.current_user_id()
  AND COALESCE(NULLIF(current_setting('app.actor_kind', true), ''), 'human') = 'human'
  AND EXISTS (SELECT 1 FROM "Project" p WHERE p.id = "ProjectTodo"."projectId"
    AND (p."ownerId" = app.current_user_id() OR EXISTS (
      SELECT 1 FROM "ProjectMembership" pm WHERE pm."projectId" = p.id
      AND pm."userId" = app.current_user_id() AND pm.role IN ('owner', 'editor'))))
);

-- Deleting one's own private todo uses the personal write permission.
DROP POLICY project_todo_capability_delete ON "ProjectTodo";
CREATE POLICY project_todo_capability_delete ON "ProjectTodo" AS RESTRICTIVE FOR DELETE
USING (app.project_todo_capability_allowed("projectId", 'task:write'));
