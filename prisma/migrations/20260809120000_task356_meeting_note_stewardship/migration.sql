-- TASK-356: Meeting note stewardship and decision provenance
-- Adds a durable steward/facilitator actor to ProjectMeetingNote so that every
-- note has a visible, reassignable accountable owner. Stewards follow the
-- established human-or-agent actor contract from TASK-330 and are independent
-- from participants and meeting-todo assignees.

ALTER TABLE "ProjectMeetingNote"
  ADD COLUMN "stewardUserId" TEXT,
  ADD COLUMN "stewardCredentialId" TEXT,
  ADD COLUMN "stewardKind" "MeetingTodoActorKind",
  ADD COLUMN "stewardDisplayNameSnapshot" VARCHAR(80);

-- Backfill every existing note's steward from its creator so historical notes
-- surface an accountable owner. The display snapshot is derived from the
-- creator's username, falling back to name and email for robustness.
UPDATE "ProjectMeetingNote" AS note
SET
  "stewardUserId" = note."createdByUserId",
  "stewardKind" = 'human',
  "stewardDisplayNameSnapshot" = LEFT(
    COALESCE(
      NULLIF("user"."username", ''),
      NULLIF("user"."name", ''),
      NULLIF("user"."email", ''),
      'Unknown actor'
    ),
    80
  )
FROM "User" AS "user"
WHERE "user"."id" = note."createdByUserId";

ALTER TABLE "ProjectMeetingNote"
  ADD CONSTRAINT "ProjectMeetingNote_stewardUserId_fkey"
    FOREIGN KEY ("stewardUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectMeetingNote_stewardCredentialId_fkey"
    FOREIGN KEY ("stewardCredentialId") REFERENCES "ApiCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectMeetingNote_steward_actor_check"
    CHECK (
      ("stewardKind" IS NULL
        AND "stewardUserId" IS NULL
        AND "stewardCredentialId" IS NULL
        AND "stewardDisplayNameSnapshot" IS NULL)
      OR (
        "stewardKind" IS NOT NULL
        AND "stewardDisplayNameSnapshot" IS NOT NULL
        -- Keep the actor snapshot valid when an FK target is deleted and
        -- ON DELETE SET NULL removes its stable identifier.
        AND num_nonnulls("stewardUserId", "stewardCredentialId") <= 1
        AND ("stewardKind" = 'human' OR "stewardUserId" IS NULL)
        AND ("stewardKind" = 'agent' OR "stewardCredentialId" IS NULL)
      )
    );

CREATE INDEX "ProjectMeetingNote_stewardUserId_idx"
  ON "ProjectMeetingNote"("stewardUserId");
CREATE INDEX "ProjectMeetingNote_stewardCredentialId_idx"
  ON "ProjectMeetingNote"("stewardCredentialId");

-- Return only display-safe project actor status to any current project member.
-- SECURITY DEFINER avoids exposing token-bearing ApiCredential rows while also
-- avoiding owner-only membership/credential read policies.
CREATE OR REPLACE FUNCTION app.list_project_meeting_note_actors(target_project_id TEXT)
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
    SELECT p.id, p."ownerId"
    FROM "Project" p
    WHERE p.id = target_project_id
      AND (
        p."ownerId" = app.current_user_id()
        OR EXISTS (
          SELECT 1
          FROM "ProjectMembership" access_membership
          WHERE access_membership."projectId" = p.id
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

REVOKE ALL ON FUNCTION app.list_project_meeting_note_actors(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.list_project_meeting_note_actors(TEXT) TO PUBLIC;
