ALTER TABLE "Task"
ADD COLUMN "createdByUserId" TEXT,
ADD COLUMN "updatedByUserId" TEXT,
ADD COLUMN "assigneeUserId" TEXT;

UPDATE "Task" AS task
SET
  "createdByUserId" = project."ownerId",
  "updatedByUserId" = project."ownerId"
FROM "Project" AS project
WHERE project.id = task."projectId";

ALTER TABLE "Task"
ALTER COLUMN "createdByUserId" SET NOT NULL,
ALTER COLUMN "updatedByUserId" SET NOT NULL;

CREATE INDEX "Task_createdByUserId_idx" ON "Task"("createdByUserId");
CREATE INDEX "Task_updatedByUserId_idx" ON "Task"("updatedByUserId");
CREATE INDEX "Task_assigneeUserId_idx" ON "Task"("assigneeUserId");
CREATE INDEX "Task_projectId_assigneeUserId_idx" ON "Task"("projectId", "assigneeUserId");

ALTER TABLE "Task"
ADD CONSTRAINT "Task_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Task"
ADD CONSTRAINT "Task_updatedByUserId_fkey"
FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Task"
ADD CONSTRAINT "Task_assigneeUserId_fkey"
FOREIGN KEY ("assigneeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
