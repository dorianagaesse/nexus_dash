-- AlterTable
ALTER TABLE "Task" ADD COLUMN "labelsJson" TEXT;

-- Backfill existing single-label values into labelsJson
UPDATE "Task"
SET "labelsJson" = json_array("label")
WHERE "label" IS NOT NULL AND trim("label") <> '';

-- CreateTable
CREATE TABLE "TaskBlockedFollowUp" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskBlockedFollowUp_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TaskBlockedFollowUp_taskId_createdAt_idx" ON "TaskBlockedFollowUp"("taskId", "createdAt");

-- Backfill legacy blockedNote values into timeline entries
INSERT INTO "TaskBlockedFollowUp" ("id", "taskId", "content", "createdAt")
SELECT
  lower(hex(randomblob(16))),
  "id",
  "blockedNote",
  COALESCE("updatedAt", CURRENT_TIMESTAMP)
FROM "Task"
WHERE "blockedNote" IS NOT NULL AND trim("blockedNote") <> '';
