-- ND-178 / TASK-337: first-class project actor identity foundation.
-- Attribute agent-executed task create/update mutations to the acting
-- ApiCredential with a durable label snapshot; credential owner user ids
-- remain authoritative for governance and RLS execution.

ALTER TABLE "Task"
ADD COLUMN "createdByCredentialId" TEXT,
ADD COLUMN "createdByCredentialLabel" VARCHAR(80),
ADD COLUMN "updatedByCredentialId" TEXT,
ADD COLUMN "updatedByCredentialLabel" VARCHAR(80);

CREATE INDEX "Task_createdByCredentialId_idx" ON "Task"("createdByCredentialId");
CREATE INDEX "Task_updatedByCredentialId_idx" ON "Task"("updatedByCredentialId");

ALTER TABLE "Task"
ADD CONSTRAINT "Task_createdByCredentialId_fkey"
FOREIGN KEY ("createdByCredentialId") REFERENCES "ApiCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "Task_updatedByCredentialId_fkey"
FOREIGN KEY ("updatedByCredentialId") REFERENCES "ApiCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE;
