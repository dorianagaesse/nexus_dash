CREATE TYPE "ProjectActorKind" AS ENUM ('human', 'agent');

ALTER TABLE "Task"
  ADD COLUMN "assigneeKind" "ProjectActorKind",
  ADD COLUMN "assigneeCredentialId" TEXT,
  ADD COLUMN "assigneeDisplayNameSnapshot" VARCHAR(80),
  ADD COLUMN "assigneeAssignedByKind" "ProjectActorKind",
  ADD COLUMN "assigneeAssignedByUserId" TEXT,
  ADD COLUMN "assigneeAssignedByCredentialId" TEXT,
  ADD COLUMN "assigneeAssignedByDisplayNameSnapshot" VARCHAR(80),
  ADD COLUMN "assigneeAssignedAt" TIMESTAMP(3);

UPDATE "Task" AS task
SET
  "assigneeKind" = 'human',
  "assigneeDisplayNameSnapshot" = LEFT(
    COALESCE(
      NULLIF("user"."username", ''),
      NULLIF("user"."name", ''),
      NULLIF("user"."email", ''),
      'Unknown actor'
    ),
    80
  )
FROM "User" AS "user"
WHERE task."assigneeUserId" = "user"."id";

ALTER TABLE "Task"
  ADD CONSTRAINT "Task_assigneeCredentialId_fkey"
    FOREIGN KEY ("assigneeCredentialId") REFERENCES "ApiCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Task_assigneeAssignedByUserId_fkey"
    FOREIGN KEY ("assigneeAssignedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Task_assigneeAssignedByCredentialId_fkey"
    FOREIGN KEY ("assigneeAssignedByCredentialId") REFERENCES "ApiCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Task_assignee_actor_check"
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
  ADD CONSTRAINT "Task_assignee_provenance_check"
    CHECK (
      ("assigneeAssignedByKind" IS NULL AND "assigneeAssignedByUserId" IS NULL AND "assigneeAssignedByCredentialId" IS NULL AND "assigneeAssignedByDisplayNameSnapshot" IS NULL AND "assigneeAssignedAt" IS NULL)
      OR (
        "assigneeAssignedByKind" IS NOT NULL
        AND "assigneeAssignedByDisplayNameSnapshot" IS NOT NULL
        AND "assigneeAssignedAt" IS NOT NULL
        AND num_nonnulls("assigneeAssignedByUserId", "assigneeAssignedByCredentialId") <= 1
        AND ("assigneeAssignedByKind" = 'human' OR "assigneeAssignedByUserId" IS NULL)
        AND ("assigneeAssignedByKind" = 'agent' OR "assigneeAssignedByCredentialId" IS NULL)
      )
    );

CREATE INDEX "Task_assigneeCredentialId_idx"
  ON "Task"("assigneeCredentialId");
CREATE INDEX "Task_projectId_assigneeCredentialId_idx"
  ON "Task"("projectId", "assigneeCredentialId");

ALTER TABLE "ProjectMeetingNoteAction"
  ADD COLUMN "assignedByKind" "ProjectActorKind",
  ADD COLUMN "assignedByUserId" TEXT,
  ADD COLUMN "assignedByCredentialId" TEXT,
  ADD COLUMN "assignedByDisplayNameSnapshot" VARCHAR(80),
  ADD COLUMN "assignedAt" TIMESTAMP(3);

ALTER TABLE "ProjectMeetingNoteAction"
  ADD CONSTRAINT "ProjectMeetingNoteAction_assignedByUserId_fkey"
    FOREIGN KEY ("assignedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectMeetingNoteAction_assignedByCredentialId_fkey"
    FOREIGN KEY ("assignedByCredentialId") REFERENCES "ApiCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectMeetingNoteAction_assignment_provenance_check"
    CHECK (
      ("assignedByKind" IS NULL AND "assignedByUserId" IS NULL AND "assignedByCredentialId" IS NULL AND "assignedByDisplayNameSnapshot" IS NULL AND "assignedAt" IS NULL)
      OR (
        "assignedByKind" IS NOT NULL
        AND "assignedByDisplayNameSnapshot" IS NOT NULL
        AND "assignedAt" IS NOT NULL
        AND num_nonnulls("assignedByUserId", "assignedByCredentialId") <= 1
        AND ("assignedByKind" = 'human' OR "assignedByUserId" IS NULL)
        AND ("assignedByKind" = 'agent' OR "assignedByCredentialId" IS NULL)
      )
    );

CREATE TABLE "TaskAssigneeChange" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "previousAssigneeKind" "ProjectActorKind",
  "previousAssigneeUserId" TEXT,
  "previousAssigneeCredentialId" TEXT,
  "previousAssigneeDisplayNameSnapshot" VARCHAR(80),
  "nextAssigneeKind" "ProjectActorKind",
  "nextAssigneeUserId" TEXT,
  "nextAssigneeCredentialId" TEXT,
  "nextAssigneeDisplayNameSnapshot" VARCHAR(80),
  "changedByKind" "ProjectActorKind" NOT NULL,
  "changedByUserId" TEXT,
  "changedByCredentialId" TEXT,
  "changedByDisplayNameSnapshot" VARCHAR(80) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TaskAssigneeChange_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TaskAssigneeChange"
  ADD CONSTRAINT "TaskAssigneeChange_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "TaskAssigneeChange_previousAssigneeUserId_fkey"
    FOREIGN KEY ("previousAssigneeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "TaskAssigneeChange_previousAssigneeCredentialId_fkey"
    FOREIGN KEY ("previousAssigneeCredentialId") REFERENCES "ApiCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "TaskAssigneeChange_nextAssigneeUserId_fkey"
    FOREIGN KEY ("nextAssigneeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "TaskAssigneeChange_nextAssigneeCredentialId_fkey"
    FOREIGN KEY ("nextAssigneeCredentialId") REFERENCES "ApiCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "TaskAssigneeChange_changedByUserId_fkey"
    FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "TaskAssigneeChange_changedByCredentialId_fkey"
    FOREIGN KEY ("changedByCredentialId") REFERENCES "ApiCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "TaskAssigneeChange_previous_assignee_actor_check"
    CHECK (
      ("previousAssigneeKind" IS NULL AND "previousAssigneeUserId" IS NULL AND "previousAssigneeCredentialId" IS NULL AND "previousAssigneeDisplayNameSnapshot" IS NULL)
      OR (
        "previousAssigneeKind" IS NOT NULL
        AND "previousAssigneeDisplayNameSnapshot" IS NOT NULL
        AND num_nonnulls("previousAssigneeUserId", "previousAssigneeCredentialId") <= 1
        AND ("previousAssigneeKind" = 'human' OR "previousAssigneeUserId" IS NULL)
        AND ("previousAssigneeKind" = 'agent' OR "previousAssigneeCredentialId" IS NULL)
      )
    ),
  ADD CONSTRAINT "TaskAssigneeChange_next_assignee_actor_check"
    CHECK (
      ("nextAssigneeKind" IS NULL AND "nextAssigneeUserId" IS NULL AND "nextAssigneeCredentialId" IS NULL AND "nextAssigneeDisplayNameSnapshot" IS NULL)
      OR (
        "nextAssigneeKind" IS NOT NULL
        AND "nextAssigneeDisplayNameSnapshot" IS NOT NULL
        AND num_nonnulls("nextAssigneeUserId", "nextAssigneeCredentialId") <= 1
        AND ("nextAssigneeKind" = 'human' OR "nextAssigneeUserId" IS NULL)
        AND ("nextAssigneeKind" = 'agent' OR "nextAssigneeCredentialId" IS NULL)
      )
    ),
  ADD CONSTRAINT "TaskAssigneeChange_changed_by_actor_check"
    CHECK (
      "changedByDisplayNameSnapshot" IS NOT NULL
      AND num_nonnulls("changedByUserId", "changedByCredentialId") <= 1
      AND ("changedByKind" = 'human' OR "changedByUserId" IS NULL)
      AND ("changedByKind" = 'agent' OR "changedByCredentialId" IS NULL)
    );

CREATE INDEX "TaskAssigneeChange_taskId_createdAt_idx"
  ON "TaskAssigneeChange"("taskId", "createdAt");

CREATE TABLE "ProjectMeetingNoteActionAssigneeChange" (
  "id" TEXT NOT NULL,
  "actionId" TEXT NOT NULL,
  "previousAssigneeKind" "MeetingTodoActorKind",
  "previousAssigneeUserId" TEXT,
  "previousAssigneeCredentialId" TEXT,
  "previousAssigneeDisplayNameSnapshot" VARCHAR(80),
  "nextAssigneeKind" "MeetingTodoActorKind",
  "nextAssigneeUserId" TEXT,
  "nextAssigneeCredentialId" TEXT,
  "nextAssigneeDisplayNameSnapshot" VARCHAR(80),
  "changedByKind" "ProjectActorKind" NOT NULL,
  "changedByUserId" TEXT,
  "changedByCredentialId" TEXT,
  "changedByDisplayNameSnapshot" VARCHAR(80) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProjectMeetingNoteActionAssigneeChange_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ProjectMeetingNoteActionAssigneeChange"
  ADD CONSTRAINT "ProjectMeetingNoteActionAssigneeChange_actionId_fkey"
    FOREIGN KEY ("actionId") REFERENCES "ProjectMeetingNoteAction"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  -- Long relation names use Prisma's canonical (<=63 char) truncated form so the
  -- migrated database stays drift-free against schema.prisma.
  ADD CONSTRAINT "ProjectMeetingNoteActionAssigneeChange_previousAssigneeUse_fkey"
    FOREIGN KEY ("previousAssigneeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectMeetingNoteActionAssigneeChange_previousAssigneeCre_fkey"
    FOREIGN KEY ("previousAssigneeCredentialId") REFERENCES "ApiCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectMeetingNoteActionAssigneeChange_nextAssigneeUserId_fkey"
    FOREIGN KEY ("nextAssigneeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectMeetingNoteActionAssigneeChange_nextAssigneeCredent_fkey"
    FOREIGN KEY ("nextAssigneeCredentialId") REFERENCES "ApiCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectMeetingNoteActionAssigneeChange_changedByUserId_fkey"
    FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectMeetingNoteActionAssigneeChange_changedByCredential_fkey"
    FOREIGN KEY ("changedByCredentialId") REFERENCES "ApiCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectMeetingNoteActionAssigneeChange_previous_assignee_actor_check"
    CHECK (
      ("previousAssigneeKind" IS NULL AND "previousAssigneeUserId" IS NULL AND "previousAssigneeCredentialId" IS NULL AND "previousAssigneeDisplayNameSnapshot" IS NULL)
      OR (
        "previousAssigneeKind" IS NOT NULL
        AND "previousAssigneeDisplayNameSnapshot" IS NOT NULL
        AND num_nonnulls("previousAssigneeUserId", "previousAssigneeCredentialId") <= 1
        AND ("previousAssigneeKind" = 'human' OR "previousAssigneeUserId" IS NULL)
        AND ("previousAssigneeKind" = 'agent' OR "previousAssigneeCredentialId" IS NULL)
      )
    ),
  ADD CONSTRAINT "ProjectMeetingNoteActionAssigneeChange_next_assignee_actor_check"
    CHECK (
      ("nextAssigneeKind" IS NULL AND "nextAssigneeUserId" IS NULL AND "nextAssigneeCredentialId" IS NULL AND "nextAssigneeDisplayNameSnapshot" IS NULL)
      OR (
        "nextAssigneeKind" IS NOT NULL
        AND "nextAssigneeDisplayNameSnapshot" IS NOT NULL
        AND num_nonnulls("nextAssigneeUserId", "nextAssigneeCredentialId") <= 1
        AND ("nextAssigneeKind" = 'human' OR "nextAssigneeUserId" IS NULL)
        AND ("nextAssigneeKind" = 'agent' OR "nextAssigneeCredentialId" IS NULL)
      )
    ),
  ADD CONSTRAINT "ProjectMeetingNoteActionAssigneeChange_changed_by_actor_check"
    CHECK (
      "changedByDisplayNameSnapshot" IS NOT NULL
      AND num_nonnulls("changedByUserId", "changedByCredentialId") <= 1
      AND ("changedByKind" = 'human' OR "changedByUserId" IS NULL)
      AND ("changedByKind" = 'agent' OR "changedByCredentialId" IS NULL)
    );

CREATE INDEX "ProjectMeetingNoteActionAssigneeChange_actionId_createdAt_idx"
  ON "ProjectMeetingNoteActionAssigneeChange"("actionId", "createdAt");

ALTER TABLE "TaskAssigneeChange" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TaskAssigneeChange" FORCE ROW LEVEL SECURITY;
ALTER TABLE "ProjectMeetingNoteActionAssigneeChange" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProjectMeetingNoteActionAssigneeChange" FORCE ROW LEVEL SECURITY;

-- Assignment history is append-only: project members can read it, project
-- owners and editors can append, and no policy grants UPDATE or DELETE.
CREATE POLICY task_assignee_change_select_policy ON "TaskAssigneeChange"
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM "Task" t
    JOIN "Project" p ON p.id = t."projectId"
    WHERE t.id = "TaskAssigneeChange"."taskId"
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

CREATE POLICY task_assignee_change_insert_policy ON "TaskAssigneeChange"
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM "Task" t
    JOIN "Project" p ON p.id = t."projectId"
    WHERE t.id = "TaskAssigneeChange"."taskId"
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
