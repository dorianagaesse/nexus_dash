CREATE TYPE "MeetingTodoActorKind" AS ENUM ('human', 'agent');

ALTER TABLE "ProjectMeetingNoteAction"
  ADD COLUMN "createdByUserId" TEXT,
  ADD COLUMN "createdByCredentialId" TEXT,
  ADD COLUMN "creatorKind" "MeetingTodoActorKind" NOT NULL DEFAULT 'human',
  ADD COLUMN "creatorDisplayNameSnapshot" VARCHAR(80) NOT NULL DEFAULT 'Unknown actor',
  ADD COLUMN "assigneeUserId" TEXT,
  ADD COLUMN "assigneeCredentialId" TEXT,
  ADD COLUMN "assigneeKind" "MeetingTodoActorKind",
  ADD COLUMN "assigneeDisplayNameSnapshot" VARCHAR(80),
  ADD COLUMN "completedByUserId" TEXT,
  ADD COLUMN "completedByCredentialId" TEXT,
  ADD COLUMN "completedByKind" "MeetingTodoActorKind",
  ADD COLUMN "completedByDisplayNameSnapshot" VARCHAR(80);

UPDATE "ProjectMeetingNoteAction" AS action
SET
  "createdByUserId" = note."createdByUserId",
  "creatorDisplayNameSnapshot" = LEFT(
    COALESCE(
      NULLIF("user"."username", ''),
      NULLIF("user"."name", ''),
      NULLIF("user"."email", ''),
      'Unknown actor'
    ),
    80
  )
FROM "ProjectMeetingNote" AS note
LEFT JOIN "User" AS "user" ON "user"."id" = note."createdByUserId"
WHERE action."meetingNoteId" = note."id";

ALTER TABLE "ProjectMeetingNoteAction"
  ADD CONSTRAINT "ProjectMeetingNoteAction_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectMeetingNoteAction_createdByCredentialId_fkey"
    FOREIGN KEY ("createdByCredentialId") REFERENCES "ApiCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectMeetingNoteAction_assigneeUserId_fkey"
    FOREIGN KEY ("assigneeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectMeetingNoteAction_assigneeCredentialId_fkey"
    FOREIGN KEY ("assigneeCredentialId") REFERENCES "ApiCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectMeetingNoteAction_completedByUserId_fkey"
    FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectMeetingNoteAction_completedByCredentialId_fkey"
    FOREIGN KEY ("completedByCredentialId") REFERENCES "ApiCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectMeetingNoteAction_creator_actor_check"
    CHECK (
      num_nonnulls("createdByUserId", "createdByCredentialId") <= 1
      AND ("creatorKind" = 'human' OR "createdByUserId" IS NULL)
      AND ("creatorKind" = 'agent' OR "createdByCredentialId" IS NULL)
    ),
  ADD CONSTRAINT "ProjectMeetingNoteAction_assignee_actor_check"
    CHECK (
      ("assigneeKind" IS NULL AND "assigneeUserId" IS NULL AND "assigneeCredentialId" IS NULL AND "assigneeDisplayNameSnapshot" IS NULL)
      OR (
        "assigneeKind" IS NOT NULL
        AND "assigneeDisplayNameSnapshot" IS NOT NULL
        AND num_nonnulls("assigneeUserId", "assigneeCredentialId") <= 1
        AND ("assigneeKind" = 'human' OR "assigneeUserId" IS NULL)
        AND ("assigneeKind" = 'agent' OR "assigneeCredentialId" IS NULL)
      )
    ),
  ADD CONSTRAINT "ProjectMeetingNoteAction_completer_actor_check"
    CHECK (
      ("completedByKind" IS NULL AND "completedByUserId" IS NULL AND "completedByCredentialId" IS NULL AND "completedByDisplayNameSnapshot" IS NULL)
      OR (
        "completedByKind" IS NOT NULL
        AND "completedByDisplayNameSnapshot" IS NOT NULL
        AND num_nonnulls("completedByUserId", "completedByCredentialId") <= 1
        AND ("completedByKind" = 'human' OR "completedByUserId" IS NULL)
        AND ("completedByKind" = 'agent' OR "completedByCredentialId" IS NULL)
      )
    ),
  ADD CONSTRAINT "ProjectMeetingNoteAction_completion_actor_state_check"
    CHECK (
      "completedAt" IS NOT NULL
      OR (
        "completedByUserId" IS NULL
        AND "completedByCredentialId" IS NULL
        AND "completedByKind" IS NULL
        AND "completedByDisplayNameSnapshot" IS NULL
      )
    );

CREATE INDEX "ProjectMeetingNoteAction_assigneeUserId_completedAt_idx"
  ON "ProjectMeetingNoteAction"("assigneeUserId", "completedAt");
CREATE INDEX "ProjectMeetingNoteAction_assigneeCredentialId_completedAt_idx"
  ON "ProjectMeetingNoteAction"("assigneeCredentialId", "completedAt");
CREATE INDEX "ProjectMeetingNoteAction_createdByUserId_idx"
  ON "ProjectMeetingNoteAction"("createdByUserId");
CREATE INDEX "ProjectMeetingNoteAction_createdByCredentialId_idx"
  ON "ProjectMeetingNoteAction"("createdByCredentialId");
CREATE INDEX "ProjectMeetingNoteAction_completedByUserId_idx"
  ON "ProjectMeetingNoteAction"("completedByUserId");
CREATE INDEX "ProjectMeetingNoteAction_completedByCredentialId_idx"
  ON "ProjectMeetingNoteAction"("completedByCredentialId");
