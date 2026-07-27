CREATE TABLE "ProjectMeetingNoteParticipant" (
    "id" TEXT NOT NULL,
    "meetingNoteId" TEXT NOT NULL,
    "userId" TEXT,
    "displayName" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectMeetingNoteParticipant_pkey" PRIMARY KEY ("id")
);

INSERT INTO "ProjectMeetingNoteParticipant" (
    "id",
    "meetingNoteId",
    "userId",
    "displayName",
    "position",
    "createdAt",
    "updatedAt"
)
SELECT
    'legacy-' || md5(note."id" || ':' || participant.ordinality::text),
    note."id",
    NULL,
    participant."displayName",
    participant.ordinality::integer - 1,
    note."createdAt",
    note."updatedAt"
FROM "ProjectMeetingNote" note
CROSS JOIN LATERAL unnest(note."participants")
    WITH ORDINALITY AS participant("displayName", ordinality);

CREATE UNIQUE INDEX "ProjectMeetingNoteParticipant_meetingNoteId_position_key"
ON "ProjectMeetingNoteParticipant"("meetingNoteId", "position");

CREATE INDEX "ProjectMeetingNoteParticipant_meetingNoteId_idx"
ON "ProjectMeetingNoteParticipant"("meetingNoteId");

CREATE INDEX "ProjectMeetingNoteParticipant_userId_idx"
ON "ProjectMeetingNoteParticipant"("userId");

ALTER TABLE "ProjectMeetingNoteParticipant"
ADD CONSTRAINT "ProjectMeetingNoteParticipant_meetingNoteId_fkey"
FOREIGN KEY ("meetingNoteId") REFERENCES "ProjectMeetingNote"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectMeetingNoteParticipant"
ADD CONSTRAINT "ProjectMeetingNoteParticipant_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProjectMeetingNote" DROP COLUMN "participants";

ALTER TABLE "ProjectMeetingNoteParticipant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProjectMeetingNoteParticipant" FORCE ROW LEVEL SECURITY;

CREATE POLICY project_meeting_note_participant_select_policy
ON "ProjectMeetingNoteParticipant"
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM "ProjectMeetingNote" mn
    WHERE mn.id = "ProjectMeetingNoteParticipant"."meetingNoteId"
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
