-- TASK-318 extends forced RLS to project-derived tables that previously relied
-- only on service-layer authorization.

ALTER TABLE "TaskCommentReaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TaskCommentReaction" FORCE ROW LEVEL SECURITY;
ALTER TABLE "ApiCredential" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApiCredential" FORCE ROW LEVEL SECURITY;
ALTER TABLE "ApiCredentialScopeGrant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApiCredentialScopeGrant" FORCE ROW LEVEL SECURITY;
ALTER TABLE "AuthAuditEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuthAuditEvent" FORCE ROW LEVEL SECURITY;

CREATE POLICY task_comment_reaction_select_policy ON "TaskCommentReaction"
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM "TaskComment" comment
    JOIN "Task" task ON task.id = comment."taskId"
    JOIN "Project" project ON project.id = task."projectId"
    WHERE comment.id = "TaskCommentReaction"."commentId"
      AND (
        project."ownerId" = app.current_user_id()
        OR EXISTS (
          SELECT 1
          FROM "ProjectMembership" membership
          WHERE membership."projectId" = project.id
            AND membership."userId" = app.current_user_id()
        )
      )
  )
);

CREATE POLICY task_comment_reaction_insert_policy ON "TaskCommentReaction"
FOR INSERT
WITH CHECK (
  "userId" = app.current_user_id()
  AND EXISTS (
    SELECT 1
    FROM "TaskComment" comment
    JOIN "Task" task ON task.id = comment."taskId"
    JOIN "Project" project ON project.id = task."projectId"
    WHERE comment.id = "TaskCommentReaction"."commentId"
      AND (
        project."ownerId" = app.current_user_id()
        OR EXISTS (
          SELECT 1
          FROM "ProjectMembership" membership
          WHERE membership."projectId" = project.id
            AND membership."userId" = app.current_user_id()
            AND membership.role IN ('owner', 'editor')
        )
      )
  )
);

CREATE POLICY task_comment_reaction_delete_policy ON "TaskCommentReaction"
FOR DELETE
USING (
  "userId" = app.current_user_id()
  AND EXISTS (
    SELECT 1
    FROM "TaskComment" comment
    JOIN "Task" task ON task.id = comment."taskId"
    JOIN "Project" project ON project.id = task."projectId"
    WHERE comment.id = "TaskCommentReaction"."commentId"
      AND (
        project."ownerId" = app.current_user_id()
        OR EXISTS (
          SELECT 1
          FROM "ProjectMembership" membership
          WHERE membership."projectId" = project.id
            AND membership."userId" = app.current_user_id()
            AND membership.role IN ('owner', 'editor')
        )
      )
  )
);

CREATE POLICY api_credential_select_policy ON "ApiCredential"
FOR SELECT
USING (app.is_project_owner("projectId"));

CREATE POLICY api_credential_insert_policy ON "ApiCredential"
FOR INSERT
WITH CHECK (
  app.is_project_owner("projectId")
  AND "createdByUserId" = app.current_user_id()
);

CREATE POLICY api_credential_update_policy ON "ApiCredential"
FOR UPDATE
USING (app.is_project_owner("projectId"))
WITH CHECK (
  app.is_project_owner("projectId")
  AND "createdByUserId" = app.current_user_id()
  AND (
    "revokedByUserId" IS NULL
    OR "revokedByUserId" = app.current_user_id()
  )
);

CREATE POLICY api_credential_delete_policy ON "ApiCredential"
FOR DELETE
USING (app.is_project_owner("projectId"));

CREATE POLICY api_credential_scope_grant_select_policy ON "ApiCredentialScopeGrant"
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM "ApiCredential" credential
    WHERE credential.id = "ApiCredentialScopeGrant"."credentialId"
      AND app.is_project_owner(credential."projectId")
  )
);

CREATE POLICY api_credential_scope_grant_insert_policy ON "ApiCredentialScopeGrant"
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM "ApiCredential" credential
    WHERE credential.id = "ApiCredentialScopeGrant"."credentialId"
      AND app.is_project_owner(credential."projectId")
  )
);

CREATE POLICY api_credential_scope_grant_delete_policy ON "ApiCredentialScopeGrant"
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM "ApiCredential" credential
    WHERE credential.id = "ApiCredentialScopeGrant"."credentialId"
      AND app.is_project_owner(credential."projectId")
  )
);

CREATE POLICY auth_audit_event_select_policy ON "AuthAuditEvent"
FOR SELECT
USING (app.is_project_owner("projectId"));

CREATE POLICY auth_audit_event_insert_policy ON "AuthAuditEvent"
FOR INSERT
WITH CHECK (
  "actorUserId" = app.current_user_id()
  AND app.is_project_owner("projectId")
  AND (
    "credentialId" IS NULL
    OR EXISTS (
      SELECT 1
      FROM "ApiCredential" credential
      WHERE credential.id = "AuthAuditEvent"."credentialId"
        AND credential."projectId" = "AuthAuditEvent"."projectId"
    )
  )
);

-- Raw API keys must be resolved before an actor context exists. Keep that
-- pre-authentication capability narrow: one exact public ID and only the fields
-- required to verify the secret and issue a token.
CREATE OR REPLACE FUNCTION app.get_agent_credential_for_exchange(_public_id TEXT)
RETURNS TABLE (
  id TEXT,
  label TEXT,
  secret_hash TEXT,
  public_id TEXT,
  project_id TEXT,
  created_by_user_id TEXT,
  expires_at TIMESTAMP(3),
  revoked_at TIMESTAMP(3),
  scopes TEXT[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    credential.id,
    credential.label,
    credential."secretHash",
    credential."publicId",
    credential."projectId",
    credential."createdByUserId",
    credential."expiresAt",
    credential."revokedAt",
    COALESCE(
      array_agg(scope_grant.scope::TEXT ORDER BY scope_grant.scope)
        FILTER (WHERE scope_grant.scope IS NOT NULL),
      ARRAY[]::TEXT[]
    )
  FROM public."ApiCredential" credential
  LEFT JOIN public."ApiCredentialScopeGrant" scope_grant
    ON scope_grant."credentialId" = credential.id
  WHERE credential."publicId" = _public_id
  GROUP BY credential.id;
$$;

REVOKE ALL ON FUNCTION app.get_agent_credential_for_exchange(TEXT) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    EXECUTE
      'GRANT EXECUTE ON FUNCTION app.get_agent_credential_for_exchange(TEXT) TO app_runtime';
  END IF;
END
$$;
