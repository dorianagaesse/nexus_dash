CREATE TABLE "ProjectMeetingNote" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" VARCHAR(140) NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "participants" TEXT[] NOT NULL,
    "inputNotes" TEXT NOT NULL DEFAULT '',
    "outputNotes" TEXT NOT NULL DEFAULT '',
    "decisions" TEXT NOT NULL DEFAULT '',
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectMeetingNote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectMeetingNoteAction" (
    "id" TEXT NOT NULL,
    "meetingNoteId" TEXT NOT NULL,
    "content" VARCHAR(240) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectMeetingNoteAction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProjectMeetingNote_projectId_scheduledAt_idx" ON "ProjectMeetingNote"("projectId", "scheduledAt");
CREATE INDEX "ProjectMeetingNote_projectId_updatedAt_idx" ON "ProjectMeetingNote"("projectId", "updatedAt");
CREATE INDEX "ProjectMeetingNote_createdByUserId_idx" ON "ProjectMeetingNote"("createdByUserId");
CREATE INDEX "ProjectMeetingNote_updatedByUserId_idx" ON "ProjectMeetingNote"("updatedByUserId");
CREATE INDEX "ProjectMeetingNoteAction_meetingNoteId_position_idx" ON "ProjectMeetingNoteAction"("meetingNoteId", "position");
CREATE INDEX "ProjectMeetingNoteAction_meetingNoteId_completedAt_idx" ON "ProjectMeetingNoteAction"("meetingNoteId", "completedAt");

ALTER TABLE "ProjectMeetingNote"
ADD CONSTRAINT "ProjectMeetingNote_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectMeetingNote"
ADD CONSTRAINT "ProjectMeetingNote_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectMeetingNote"
ADD CONSTRAINT "ProjectMeetingNote_updatedByUserId_fkey"
FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectMeetingNoteAction"
ADD CONSTRAINT "ProjectMeetingNoteAction_meetingNoteId_fkey"
FOREIGN KEY ("meetingNoteId") REFERENCES "ProjectMeetingNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectMeetingNote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProjectMeetingNote" FORCE ROW LEVEL SECURITY;
ALTER TABLE "ProjectMeetingNoteAction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProjectMeetingNoteAction" FORCE ROW LEVEL SECURITY;

CREATE POLICY project_meeting_note_select_policy ON "ProjectMeetingNote"
FOR SELECT
USING (
  EXISTS (
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

CREATE POLICY project_meeting_note_insert_policy ON "ProjectMeetingNote"
FOR INSERT
WITH CHECK (
  "createdByUserId" = app.current_user_id()
  AND "updatedByUserId" = app.current_user_id()
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

CREATE POLICY project_meeting_note_update_policy ON "ProjectMeetingNote"
FOR UPDATE
USING (
  EXISTS (
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

CREATE POLICY project_meeting_note_delete_policy ON "ProjectMeetingNote"
FOR DELETE
USING (
  EXISTS (
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

CREATE POLICY project_meeting_note_action_select_policy ON "ProjectMeetingNoteAction"
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM "ProjectMeetingNote" mn
    WHERE mn.id = "ProjectMeetingNoteAction"."meetingNoteId"
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

CREATE POLICY project_meeting_note_action_insert_policy ON "ProjectMeetingNoteAction"
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM "ProjectMeetingNote" mn
    JOIN "Project" p ON p.id = mn."projectId"
    WHERE mn.id = "ProjectMeetingNoteAction"."meetingNoteId"
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

CREATE POLICY project_meeting_note_action_update_policy ON "ProjectMeetingNoteAction"
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM "ProjectMeetingNote" mn
    JOIN "Project" p ON p.id = mn."projectId"
    WHERE mn.id = "ProjectMeetingNoteAction"."meetingNoteId"
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

CREATE POLICY project_meeting_note_action_delete_policy ON "ProjectMeetingNoteAction"
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM "ProjectMeetingNote" mn
    JOIN "Project" p ON p.id = mn."projectId"
    WHERE mn.id = "ProjectMeetingNoteAction"."meetingNoteId"
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
