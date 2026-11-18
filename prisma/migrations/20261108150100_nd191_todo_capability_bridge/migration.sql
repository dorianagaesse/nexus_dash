-- ND-130 and ND-191 can land in either order. Existing role/tenant policies
-- remain mandatory; once the canonical capability function is installed this
-- additional restriction delegates to it on every query. No grants are copied.
CREATE FUNCTION app.project_todo_capability_allowed(target_project_id TEXT, capability TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SET search_path = public, pg_temp
AS $$
DECLARE allowed BOOLEAN;
BEGIN
  IF to_regprocedure('app.has_project_capability(text,text)') IS NULL THEN
    RETURN TRUE;
  END IF;
  EXECUTE 'SELECT app.has_project_capability($1, $2)'
    INTO allowed USING target_project_id, capability;
  RETURN COALESCE(allowed, FALSE);
END;
$$;

CREATE POLICY project_todo_capability_read ON "ProjectTodo" AS RESTRICTIVE FOR SELECT
USING (app.project_todo_capability_allowed("projectId", 'task:read'));
CREATE POLICY project_todo_capability_create ON "ProjectTodo" AS RESTRICTIVE FOR INSERT
WITH CHECK (app.project_todo_capability_allowed("projectId", 'task:write'));
CREATE POLICY project_todo_capability_update ON "ProjectTodo" AS RESTRICTIVE FOR UPDATE
USING (app.project_todo_capability_allowed("projectId", 'task:write'))
WITH CHECK (app.project_todo_capability_allowed("projectId", 'task:write'));
CREATE POLICY project_todo_capability_delete ON "ProjectTodo" AS RESTRICTIVE FOR DELETE
USING (app.project_todo_capability_allowed("projectId", 'task:delete'));
