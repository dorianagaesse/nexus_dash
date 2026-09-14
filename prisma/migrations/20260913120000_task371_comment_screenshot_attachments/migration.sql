ALTER TABLE "TaskAttachment" ADD COLUMN "commentId" TEXT;

CREATE INDEX "TaskAttachment_commentId_idx" ON "TaskAttachment"("commentId");

ALTER TABLE "TaskAttachment"
ADD CONSTRAINT "TaskAttachment_commentId_fkey"
FOREIGN KEY ("commentId") REFERENCES "TaskComment"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

DROP POLICY task_attachment_delete_policy ON "TaskAttachment";

CREATE POLICY task_attachment_delete_policy ON "TaskAttachment"
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM "Task" t
    JOIN "Project" p ON p.id = t."projectId"
    WHERE t.id = "TaskAttachment"."taskId"
      AND (
        p."ownerId" = app.current_user_id()
        OR (
          "TaskAttachment"."uploadedByUserId" = app.current_user_id()
          AND "TaskAttachment"."commentId" IS NULL
          AND EXISTS (
            SELECT 1
            FROM "ProjectMembership" pm
            WHERE pm."projectId" = p.id
              AND pm."userId" = app.current_user_id()
              AND pm.role IN ('owner', 'editor')
          )
        )
      )
  )
);
