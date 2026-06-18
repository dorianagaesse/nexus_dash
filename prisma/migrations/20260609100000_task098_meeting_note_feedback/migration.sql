ALTER TABLE "ProjectMeetingNote"
ADD COLUMN "status" VARCHAR(40) NOT NULL DEFAULT 'prepared',
ADD COLUMN "labelsJson" TEXT;

CREATE INDEX "ProjectMeetingNote_projectId_status_scheduledAt_idx"
ON "ProjectMeetingNote"("projectId", "status", "scheduledAt");
