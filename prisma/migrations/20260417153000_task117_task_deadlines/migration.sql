ALTER TABLE "Task"
ADD COLUMN "deadlineAt" DATE;

CREATE INDEX "Task_projectId_deadlineAt_idx"
ON "Task"("projectId", "deadlineAt");
