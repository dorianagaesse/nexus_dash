ALTER TABLE "TaskAttachment" ADD COLUMN "commentId" TEXT;

CREATE INDEX "TaskAttachment_commentId_idx" ON "TaskAttachment"("commentId");

ALTER TABLE "TaskAttachment"
ADD CONSTRAINT "TaskAttachment_commentId_fkey"
FOREIGN KEY ("commentId") REFERENCES "TaskComment"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
