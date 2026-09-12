-- ND-383: durable tagged-agent events for task comments.
-- One event per (comment, mentioned credential) with label and actor snapshots
-- so renames, revocations, and credential deletion never rewrite recorded
-- history; comment or task deletion cascades the events away.

CREATE TABLE "TaskCommentAgentMention" (
  "id" TEXT NOT NULL,
  "commentId" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "agentCredentialId" TEXT,
  "agentLabel" VARCHAR(80) NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "createdByCredentialId" TEXT,
  "createdByCredentialLabel" VARCHAR(80),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TaskCommentAgentMention_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TaskCommentAgentMention_commentId_agentCredentialId_key" ON "TaskCommentAgentMention"("commentId", "agentCredentialId");
CREATE INDEX "TaskCommentAgentMention_taskId_createdAt_idx" ON "TaskCommentAgentMention"("taskId", "createdAt");
CREATE INDEX "TaskCommentAgentMention_agentCredentialId_idx" ON "TaskCommentAgentMention"("agentCredentialId");
CREATE INDEX "TaskCommentAgentMention_createdByUserId_idx" ON "TaskCommentAgentMention"("createdByUserId");
CREATE INDEX "TaskCommentAgentMention_createdByCredentialId_idx" ON "TaskCommentAgentMention"("createdByCredentialId");

ALTER TABLE "TaskCommentAgentMention"
ADD CONSTRAINT "TaskCommentAgentMention_commentId_fkey"
FOREIGN KEY ("commentId") REFERENCES "TaskComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskCommentAgentMention"
ADD CONSTRAINT "TaskCommentAgentMention_taskId_fkey"
FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskCommentAgentMention"
ADD CONSTRAINT "TaskCommentAgentMention_agentCredentialId_fkey"
FOREIGN KEY ("agentCredentialId") REFERENCES "ApiCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TaskCommentAgentMention"
ADD CONSTRAINT "TaskCommentAgentMention_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskCommentAgentMention"
ADD CONSTRAINT "TaskCommentAgentMention_createdByCredentialId_fkey"
FOREIGN KEY ("createdByCredentialId") REFERENCES "ApiCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TaskCommentAgentMention" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TaskCommentAgentMention" FORCE ROW LEVEL SECURITY;

-- Project members read tagged-agent history, editors record it, and the
-- recording actor may retract it (deterministic re-sync / future comment
-- edits). Events are immutable: no UPDATE policy exists.
--
-- The insert policy pins "taskId" to the comment's own task: authorizing via
-- the comment alone would let a member pair an accessible comment with a task
-- owned by another project, planting a row in that task's mention history.
CREATE POLICY task_comment_agent_mention_select_policy ON "TaskCommentAgentMention"
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM "TaskComment" comment
    JOIN "Task" task ON task.id = comment."taskId"
    JOIN "Project" project ON project.id = task."projectId"
    WHERE comment.id = "TaskCommentAgentMention"."commentId"
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

CREATE POLICY task_comment_agent_mention_insert_policy ON "TaskCommentAgentMention"
FOR INSERT
WITH CHECK (
  "createdByUserId" = app.current_user_id()
  AND EXISTS (
    SELECT 1
    FROM "TaskComment" comment
    JOIN "Task" task ON task.id = comment."taskId"
    JOIN "Project" project ON project.id = task."projectId"
    WHERE comment.id = "TaskCommentAgentMention"."commentId"
      AND task.id = "TaskCommentAgentMention"."taskId"
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

CREATE POLICY task_comment_agent_mention_delete_policy ON "TaskCommentAgentMention"
FOR DELETE
USING (
  "createdByUserId" = app.current_user_id()
  AND EXISTS (
    SELECT 1
    FROM "TaskComment" comment
    JOIN "Task" task ON task.id = comment."taskId"
    JOIN "Project" project ON project.id = task."projectId"
    WHERE comment.id = "TaskCommentAgentMention"."commentId"
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

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."TaskCommentAgentMention" TO app_runtime';
  END IF;
END
$$;
