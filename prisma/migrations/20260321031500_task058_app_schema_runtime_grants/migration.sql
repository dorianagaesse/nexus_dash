-- TASK-058 ensure runtime can execute invitation helper functions in schema app.

GRANT USAGE ON SCHEMA app TO PUBLIC;

GRANT EXECUTE ON FUNCTION app.current_user_id() TO PUBLIC;
GRANT EXECUTE ON FUNCTION app.is_project_owner(TEXT) TO PUBLIC;
GRANT EXECUTE ON FUNCTION app.list_pending_project_invitations_for_current_user() TO PUBLIC;
