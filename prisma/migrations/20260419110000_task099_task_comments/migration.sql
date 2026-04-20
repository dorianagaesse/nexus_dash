CREATE TABLE "TaskComment" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "authorUserId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TaskComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TaskComment_taskId_createdAt_idx" ON "TaskComment"("taskId", "createdAt");
CREATE INDEX "TaskComment_authorUserId_idx" ON "TaskComment"("authorUserId");

ALTER TABLE "TaskComment"
ADD CONSTRAINT "TaskComment_taskId_fkey"
FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskComment"
ADD CONSTRAINT "TaskComment_authorUserId_fkey"
FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskComment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TaskComment" FORCE ROW LEVEL SECURITY;

CREATE POLICY task_comment_select_policy ON "TaskComment"
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM "Task" t
    JOIN "Project" p ON p.id = t."projectId"
    WHERE t.id = "TaskComment"."taskId"
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

CREATE POLICY task_comment_insert_policy ON "TaskComment"
FOR INSERT
WITH CHECK (
  "authorUserId" = app.current_user_id()
  AND EXISTS (
    SELECT 1
    FROM "Task" t
    JOIN "Project" p ON p.id = t."projectId"
    WHERE t.id = "TaskComment"."taskId"
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
