-- AlterTable
ALTER TABLE "TaskComment" ADD COLUMN "updatedAt" TIMESTAMP(3);

-- Policy
CREATE POLICY task_comment_update_policy ON "TaskComment"
FOR UPDATE
USING (
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
)
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
