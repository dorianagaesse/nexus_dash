CREATE OR REPLACE FUNCTION app.resolve_project_actor_responsibilities(
  target_project_id TEXT,
  departing_actor_kind TEXT,
  departing_actor_id TEXT,
  resolution_mode TEXT,
  next_user_id TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  replacement_display_name TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "Project" project
    WHERE project.id = target_project_id
      AND project."ownerId" = app.current_user_id()
  ) THEN
    RETURN 'forbidden';
  END IF;
  IF departing_actor_kind NOT IN ('human', 'agent') THEN
    RETURN 'invalid-actor-kind';
  END IF;
  IF resolution_mode NOT IN ('reassign', 'unassign') THEN
    RETURN 'invalid-resolution';
  END IF;

  IF departing_actor_kind = 'human' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM "Project" project
      WHERE project.id = target_project_id
        AND (
          project."ownerId" = departing_actor_id
          OR EXISTS (
            SELECT 1
            FROM "ProjectMembership" membership
            WHERE membership."projectId" = target_project_id
              AND membership."userId" = departing_actor_id
          )
        )
    ) THEN
      RETURN 'actor-not-found';
    END IF;
  ELSIF NOT EXISTS (
    SELECT 1
    FROM "ApiCredential" credential
    WHERE credential.id = departing_actor_id
      AND credential."projectId" = target_project_id
  ) THEN
    RETURN 'actor-not-found';
  END IF;

  IF resolution_mode = 'reassign' THEN
    IF next_user_id IS NULL
      OR (departing_actor_kind = 'human' AND next_user_id = departing_actor_id)
      OR NOT EXISTS (
        SELECT 1
        FROM "Project" project
        WHERE project.id = target_project_id
          AND (
            project."ownerId" = next_user_id
            OR EXISTS (
              SELECT 1
              FROM "ProjectMembership" membership
              WHERE membership."projectId" = target_project_id
                AND membership."userId" = next_user_id
            )
          )
      )
    THEN
      RETURN 'invalid-responsibility-replacement';
    END IF;

    SELECT LEFT(
      COALESCE(
        NULLIF(BTRIM("user".name), ''),
        CASE
          WHEN NULLIF(BTRIM("user".username), '') IS NOT NULL
            AND NULLIF(BTRIM("user"."usernameDiscriminator"), '') IS NOT NULL
          THEN BTRIM("user".username) || '#' || BTRIM("user"."usernameDiscriminator")
          ELSE NULL
        END,
        NULLIF(BTRIM("user".email), ''),
        NULLIF(BTRIM("user".username), ''),
        'Project collaborator'
      ),
      80
    )
    INTO replacement_display_name
    FROM "User" "user"
    WHERE "user".id = next_user_id;
  END IF;

  -- ND-384: resolution must maintain the task assignee actor columns so the
  -- Task_assignee_actor_check holds, and must resolve agent-assigned tasks too.
  IF departing_actor_kind = 'human' THEN
    UPDATE "Task"
    SET
      "assigneeKind" = CASE WHEN resolution_mode = 'reassign'
        THEN 'human'::"ProjectActorKind" ELSE NULL END,
      "assigneeUserId" = CASE WHEN resolution_mode = 'reassign'
        THEN next_user_id ELSE NULL END,
      "assigneeCredentialId" = NULL,
      "assigneeDisplayNameSnapshot" = CASE WHEN resolution_mode = 'reassign'
        THEN replacement_display_name ELSE NULL END
    WHERE "projectId" = target_project_id
      AND "assigneeUserId" = departing_actor_id
      AND "archivedAt" IS NULL
      AND status <> 'Done';
  ELSIF departing_actor_kind = 'agent' THEN
    UPDATE "Task"
    SET
      "assigneeKind" = CASE WHEN resolution_mode = 'reassign'
        THEN 'human'::"ProjectActorKind" ELSE NULL END,
      "assigneeUserId" = CASE WHEN resolution_mode = 'reassign'
        THEN next_user_id ELSE NULL END,
      "assigneeCredentialId" = NULL,
      "assigneeDisplayNameSnapshot" = CASE WHEN resolution_mode = 'reassign'
        THEN replacement_display_name ELSE NULL END
    WHERE "projectId" = target_project_id
      AND "assigneeKind" = 'agent'
      AND "assigneeCredentialId" = departing_actor_id
      AND "archivedAt" IS NULL
      AND status <> 'Done';
  END IF;

  UPDATE "Resource"
  SET
    "stewardKind" = CASE WHEN resolution_mode = 'reassign'
      THEN 'human'::"ContextCardActorKind" ELSE NULL END,
    "stewardUserId" = CASE WHEN resolution_mode = 'reassign'
      THEN next_user_id ELSE NULL END,
    "stewardCredentialId" = NULL,
    "stewardDisplayNameSnapshot" = CASE WHEN resolution_mode = 'reassign'
      THEN replacement_display_name ELSE NULL END
  WHERE "projectId" = target_project_id
    AND "stewardKind"::TEXT = departing_actor_kind
    AND (
      (departing_actor_kind = 'human' AND "stewardUserId" = departing_actor_id)
      OR (departing_actor_kind = 'agent' AND "stewardCredentialId" = departing_actor_id)
    );

  UPDATE "ProjectMeetingNote"
  SET
    "stewardKind" = CASE WHEN resolution_mode = 'reassign'
      THEN 'human'::"MeetingTodoActorKind" ELSE NULL END,
    "stewardUserId" = CASE WHEN resolution_mode = 'reassign'
      THEN next_user_id ELSE NULL END,
    "stewardCredentialId" = NULL,
    "stewardDisplayNameSnapshot" = CASE WHEN resolution_mode = 'reassign'
      THEN replacement_display_name ELSE NULL END
  WHERE "projectId" = target_project_id
    AND status <> 'done'
    AND "stewardKind"::TEXT = departing_actor_kind
    AND (
      (departing_actor_kind = 'human' AND "stewardUserId" = departing_actor_id)
      OR (departing_actor_kind = 'agent' AND "stewardCredentialId" = departing_actor_id)
    );

  UPDATE "ProjectMeetingNoteAction" action
  SET
    "assigneeKind" = CASE WHEN resolution_mode = 'reassign'
      THEN 'human'::"MeetingTodoActorKind" ELSE NULL END,
    "assigneeUserId" = CASE WHEN resolution_mode = 'reassign'
      THEN next_user_id ELSE NULL END,
    "assigneeCredentialId" = NULL,
    "assigneeDisplayNameSnapshot" = CASE WHEN resolution_mode = 'reassign'
      THEN replacement_display_name ELSE NULL END
  FROM "ProjectMeetingNote" note
  WHERE action."meetingNoteId" = note.id
    AND note."projectId" = target_project_id
    AND action."completedAt" IS NULL
    AND action."assigneeKind"::TEXT = departing_actor_kind
    AND (
      (departing_actor_kind = 'human' AND action."assigneeUserId" = departing_actor_id)
      OR (departing_actor_kind = 'agent' AND action."assigneeCredentialId" = departing_actor_id)
    );

  RETURN 'ok';
END;
$$;

REVOKE ALL ON FUNCTION app.resolve_project_actor_responsibilities(
  TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_project_actor_responsibilities(
  TEXT, TEXT, TEXT, TEXT, TEXT
) TO postgres;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    GRANT EXECUTE ON FUNCTION app.resolve_project_actor_responsibilities(
      TEXT, TEXT, TEXT, TEXT, TEXT
    ) TO app_runtime;
  END IF;
END;
$$;
