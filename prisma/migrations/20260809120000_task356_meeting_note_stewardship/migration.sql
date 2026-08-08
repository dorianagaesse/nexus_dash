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
        AND num_nonnulls("stewardUserId", "stewardCredentialId") = 1
        AND ("stewardKind" = 'human' OR "stewardUserId" IS NULL)
        AND ("stewardKind" = 'agent' OR "stewardCredentialId" IS NULL)
      )
    );

CREATE INDEX "ProjectMeetingNote_stewardUserId_idx"
  ON "ProjectMeetingNote"("stewardUserId");
CREATE INDEX "ProjectMeetingNote_stewardCredentialId_idx"
  ON "ProjectMeetingNote"("stewardCredentialId");
