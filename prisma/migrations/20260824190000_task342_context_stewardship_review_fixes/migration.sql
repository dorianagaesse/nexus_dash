-- Backfill historical cards and expose a display-safe actor projection under RLS.

UPDATE "Resource"
SET
  "lastEditorKind" = 'human',
  "lastEditorDisplayNameSnapshot" = 'Unknown actor'
WHERE "type" = 'context-card'
  AND "lastEditorKind" IS NULL;

CREATE OR REPLACE FUNCTION app.list_project_context_card_actors(target_project_id TEXT)
RETURNS TABLE (
  "kind" TEXT,
  "actorId" TEXT,
  "name" TEXT,
  "email" TEXT,
  "username" TEXT,
  "usernameDiscriminator" TEXT,
  "avatarSeed" TEXT,
  "label" TEXT,
  "revokedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3)
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  WITH accessible_project AS (
    SELECT project.id, project."ownerId"
    FROM "Project" project
    WHERE project.id = target_project_id
      AND (
        project."ownerId" = app.current_user_id()
        OR EXISTS (
          SELECT 1
          FROM "ProjectMembership" access_membership
          WHERE access_membership."projectId" = project.id
            AND access_membership."userId" = app.current_user_id()
        )
      )
  ),
  project_humans AS (
    SELECT accessible_project."ownerId" AS "userId"
    FROM accessible_project
    UNION
    SELECT membership."userId"
    FROM accessible_project
    JOIN "ProjectMembership" membership
      ON membership."projectId" = accessible_project.id
  )
  SELECT
    'human'::TEXT AS "kind",
    project_user.id AS "actorId",
    project_user.name,
    project_user.email,
    project_user.username::TEXT,
    project_user."usernameDiscriminator"::TEXT,
    project_user."avatarSeed"::TEXT,
    NULL::TEXT AS "label",
    NULL::TIMESTAMP(3) AS "revokedAt",
    NULL::TIMESTAMP(3) AS "expiresAt"
  FROM project_humans
  JOIN "User" project_user ON project_user.id = project_humans."userId"
  UNION ALL
  SELECT
    'agent'::TEXT AS "kind",
    credential.id AS "actorId",
    NULL::TEXT AS "name",
    NULL::TEXT AS "email",
    NULL::TEXT AS "username",
    NULL::TEXT AS "usernameDiscriminator",
    NULL::TEXT AS "avatarSeed",
    credential.label::TEXT,
    credential."revokedAt",
    credential."expiresAt"
  FROM accessible_project
  JOIN "ApiCredential" credential
    ON credential."projectId" = accessible_project.id;
$$;

REVOKE ALL ON FUNCTION app.list_project_context_card_actors(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.list_project_context_card_actors(TEXT) TO PUBLIC;
