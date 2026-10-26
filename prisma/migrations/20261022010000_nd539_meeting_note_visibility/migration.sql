-- ND-539: Add private/team visibility to ProjectMeetingNote.
-- Existing meeting notes are migrated as 'team' so currently shared notes do
-- not disappear, while new rows default to 'private'.
-- Visibility is enforced in PostgreSQL RLS across ProjectMeetingNote and its
-- child tables (participants, actions, and action assignee changes), and only
-- the human note creator can view a private note or change note visibility.

ALTER TABLE "ProjectMeetingNote"
  ADD COLUMN "visibility" VARCHAR(20) NOT NULL DEFAULT 'private';

UPDATE "ProjectMeetingNote"
  SET "visibility" = 'team';

ALTER TABLE "ProjectMeetingNote"
  ADD CONSTRAINT "ProjectMeetingNote_visibility_check"
  CHECK ("visibility" IN ('private', 'team'));

CREATE INDEX "ProjectMeetingNote_projectId_visibility_scheduledAt_idx"
  ON "ProjectMeetingNote"("projectId", "visibility", "scheduledAt");

CREATE OR REPLACE FUNCTION app.is_human_actor()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(NULLIF(current_setting('app.actor_kind', true), ''), 'human') = 'human';
$$;

REVOKE ALL ON FUNCTION app.is_human_actor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.is_human_actor() TO PUBLIC;

DROP TRIGGER meeting_content_revision ON "ProjectMeetingNote";
CREATE TRIGGER meeting_content_revision BEFORE UPDATE ON "ProjectMeetingNote" FOR EACH ROW
EXECUTE FUNCTION public.nd_content_revision('title', 'scheduledAt', 'status', 'visibility', 'labelsJson',
  'inputNotes', 'outputNotes', 'decisions', 'stewardKind', 'stewardUserId',
  'stewardCredentialId', 'stewardDisplayNameSnapshot');

CREATE OR REPLACE FUNCTION public.nd_project_meeting_note_visibility_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app
AS $$
BEGIN
  IF NEW."createdByUserId" IS DISTINCT FROM OLD."createdByUserId" THEN
    RAISE EXCEPTION 'ProjectMeetingNote.createdByUserId cannot be changed'
      USING ERRCODE = '42501';
  END IF;
  IF NEW."visibility" IS DISTINCT FROM OLD."visibility"
     AND (
       NOT app.is_human_actor()
       OR OLD."createdByUserId" IS DISTINCT FROM app.current_user_id()
     ) THEN
    RAISE EXCEPTION 'Only the note creator can change meeting note visibility'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER meeting_note_visibility_guard
BEFORE UPDATE ON "ProjectMeetingNote"
FOR EACH ROW
EXECUTE FUNCTION public.nd_project_meeting_note_visibility_guard();

DROP POLICY project_meeting_note_select_policy ON "ProjectMeetingNote";
CREATE POLICY project_meeting_note_select_policy ON "ProjectMeetingNote"
FOR SELECT
USING (
  (
    "ProjectMeetingNote"."visibility" = 'team'
    OR (
      app.is_human_actor()
      AND "ProjectMeetingNote"."createdByUserId" = app.current_user_id()
    )
  )
  AND EXISTS (
    SELECT 1
    FROM "Project" p
    WHERE p.id = "ProjectMeetingNote"."projectId"
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

DROP POLICY project_meeting_note_insert_policy ON "ProjectMeetingNote";
CREATE POLICY project_meeting_note_insert_policy ON "ProjectMeetingNote"
FOR INSERT
WITH CHECK (
  "createdByUserId" = app.current_user_id()
  AND "updatedByUserId" = app.current_user_id()
  AND (
    "visibility" = 'team'
    OR (app.is_human_actor() AND "visibility" = 'private')
  )
  AND EXISTS (
    SELECT 1
    FROM "Project" p
    WHERE p.id = "ProjectMeetingNote"."projectId"
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

DROP POLICY project_meeting_note_update_policy ON "ProjectMeetingNote";
CREATE POLICY project_meeting_note_update_policy ON "ProjectMeetingNote"
FOR UPDATE
USING (
  (
    "ProjectMeetingNote"."visibility" = 'team'
    OR (
      app.is_human_actor()
      AND "ProjectMeetingNote"."createdByUserId" = app.current_user_id()
    )
  )
  AND EXISTS (
    SELECT 1
    FROM "Project" p
    WHERE p.id = "ProjectMeetingNote"."projectId"
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
  "updatedByUserId" = app.current_user_id()
  AND (
    "ProjectMeetingNote"."visibility" = 'team'
    OR (
      app.is_human_actor()
      AND "ProjectMeetingNote"."createdByUserId" = app.current_user_id()
    )
  )
  AND EXISTS (
    SELECT 1
    FROM "Project" p
    WHERE p.id = "ProjectMeetingNote"."projectId"
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

DROP POLICY project_meeting_note_delete_policy ON "ProjectMeetingNote";
CREATE POLICY project_meeting_note_delete_policy ON "ProjectMeetingNote"
FOR DELETE
USING (
  (
    "ProjectMeetingNote"."visibility" = 'team'
    OR (
      app.is_human_actor()
      AND "ProjectMeetingNote"."createdByUserId" = app.current_user_id()
    )
  )
  AND EXISTS (
    SELECT 1
    FROM "Project" p
    WHERE p.id = "ProjectMeetingNote"."projectId"
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

DROP POLICY project_meeting_note_participant_select_policy ON "ProjectMeetingNoteParticipant";
CREATE POLICY project_meeting_note_participant_select_policy
ON "ProjectMeetingNoteParticipant"
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM "ProjectMeetingNote" mn
    WHERE mn.id = "ProjectMeetingNoteParticipant"."meetingNoteId"
      AND (
        mn."visibility" = 'team'
        OR (
          app.is_human_actor()
          AND mn."createdByUserId" = app.current_user_id()
        )
      )
      AND EXISTS (
        SELECT 1
        FROM "Project" p
        WHERE p.id = mn."projectId"
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
  )
);

DROP POLICY project_meeting_note_participant_insert_policy ON "ProjectMeetingNoteParticipant";
CREATE POLICY project_meeting_note_participant_insert_policy
ON "ProjectMeetingNoteParticipant"
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM "ProjectMeetingNote" mn
    JOIN "Project" p ON p.id = mn."projectId"
    WHERE mn.id = "ProjectMeetingNoteParticipant"."meetingNoteId"
      AND (
        mn."visibility" = 'team'
        OR (
          app.is_human_actor()
          AND mn."createdByUserId" = app.current_user_id()
        )
      )
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

DROP POLICY project_meeting_note_participant_update_policy ON "ProjectMeetingNoteParticipant";
CREATE POLICY project_meeting_note_participant_update_policy
ON "ProjectMeetingNoteParticipant"
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM "ProjectMeetingNote" mn
    JOIN "Project" p ON p.id = mn."projectId"
    WHERE mn.id = "ProjectMeetingNoteParticipant"."meetingNoteId"
      AND (
        mn."visibility" = 'team'
        OR (
          app.is_human_actor()
          AND mn."createdByUserId" = app.current_user_id()
        )
      )
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
    FROM "ProjectMeetingNote" mn
    JOIN "Project" p ON p.id = mn."projectId"
    WHERE mn.id = "ProjectMeetingNoteParticipant"."meetingNoteId"
      AND (
        mn."visibility" = 'team'
        OR (
          app.is_human_actor()
          AND mn."createdByUserId" = app.current_user_id()
        )
      )
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

DROP POLICY project_meeting_note_participant_delete_policy ON "ProjectMeetingNoteParticipant";
CREATE POLICY project_meeting_note_participant_delete_policy
ON "ProjectMeetingNoteParticipant"
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM "ProjectMeetingNote" mn
    JOIN "Project" p ON p.id = mn."projectId"
    WHERE mn.id = "ProjectMeetingNoteParticipant"."meetingNoteId"
      AND (
        mn."visibility" = 'team'
        OR (
          app.is_human_actor()
          AND mn."createdByUserId" = app.current_user_id()
        )
      )
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

DROP POLICY project_meeting_note_action_select_policy ON "ProjectMeetingNoteAction";
CREATE POLICY project_meeting_note_action_select_policy ON "ProjectMeetingNoteAction"
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM "ProjectMeetingNote" mn
    WHERE mn.id = "ProjectMeetingNoteAction"."meetingNoteId"
      AND (
        mn."visibility" = 'team'
        OR (
          app.is_human_actor()
          AND mn."createdByUserId" = app.current_user_id()
        )
      )
      AND EXISTS (
        SELECT 1
        FROM "Project" p
        WHERE p.id = mn."projectId"
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
  )
);

DROP POLICY project_meeting_note_action_insert_policy ON "ProjectMeetingNoteAction";
CREATE POLICY project_meeting_note_action_insert_policy ON "ProjectMeetingNoteAction"
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM "ProjectMeetingNote" mn
    JOIN "Project" p ON p.id = mn."projectId"
    WHERE mn.id = "ProjectMeetingNoteAction"."meetingNoteId"
      AND (
        mn."visibility" = 'team'
        OR (
          app.is_human_actor()
          AND mn."createdByUserId" = app.current_user_id()
        )
      )
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

DROP POLICY project_meeting_note_action_update_policy ON "ProjectMeetingNoteAction";
CREATE POLICY project_meeting_note_action_update_policy ON "ProjectMeetingNoteAction"
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM "ProjectMeetingNote" mn
    JOIN "Project" p ON p.id = mn."projectId"
    WHERE mn.id = "ProjectMeetingNoteAction"."meetingNoteId"
      AND (
        mn."visibility" = 'team'
        OR (
          app.is_human_actor()
          AND mn."createdByUserId" = app.current_user_id()
        )
      )
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
    FROM "ProjectMeetingNote" mn
    JOIN "Project" p ON p.id = mn."projectId"
    WHERE mn.id = "ProjectMeetingNoteAction"."meetingNoteId"
      AND (
        mn."visibility" = 'team'
        OR (
          app.is_human_actor()
          AND mn."createdByUserId" = app.current_user_id()
        )
      )
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

DROP POLICY project_meeting_note_action_delete_policy ON "ProjectMeetingNoteAction";
CREATE POLICY project_meeting_note_action_delete_policy ON "ProjectMeetingNoteAction"
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM "ProjectMeetingNote" mn
    JOIN "Project" p ON p.id = mn."projectId"
    WHERE mn.id = "ProjectMeetingNoteAction"."meetingNoteId"
      AND (
        mn."visibility" = 'team'
        OR (
          app.is_human_actor()
          AND mn."createdByUserId" = app.current_user_id()
        )
      )
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

DROP POLICY project_meeting_note_action_assignee_change_select_policy ON "ProjectMeetingNoteActionAssigneeChange";
CREATE POLICY project_meeting_note_action_assignee_change_select_policy
  ON "ProjectMeetingNoteActionAssigneeChange"
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM "ProjectMeetingNoteAction" action
    JOIN "ProjectMeetingNote" mn ON mn.id = action."meetingNoteId"
    JOIN "Project" p ON p.id = mn."projectId"
    WHERE action.id = "ProjectMeetingNoteActionAssigneeChange"."actionId"
      AND (
        mn."visibility" = 'team'
        OR (
          app.is_human_actor()
          AND mn."createdByUserId" = app.current_user_id()
        )
      )
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

DROP POLICY project_meeting_note_action_assignee_change_insert_policy ON "ProjectMeetingNoteActionAssigneeChange";
CREATE POLICY project_meeting_note_action_assignee_change_insert_policy
  ON "ProjectMeetingNoteActionAssigneeChange"
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM "ProjectMeetingNoteAction" action
    JOIN "ProjectMeetingNote" mn ON mn.id = action."meetingNoteId"
    JOIN "Project" p ON p.id = mn."projectId"
    WHERE action.id = "ProjectMeetingNoteActionAssigneeChange"."actionId"
      AND (
        mn."visibility" = 'team'
        OR (
          app.is_human_actor()
          AND mn."createdByUserId" = app.current_user_id()
        )
      )
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

-- Exclude private notes and their todos from project offboarding resolution so
-- another member's private notes are never modified during offboarding.
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
    AND "visibility" = 'team'
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
    AND note."visibility" = 'team'
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
