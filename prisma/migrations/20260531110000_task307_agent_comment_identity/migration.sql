ALTER TABLE "TaskComment"
ADD COLUMN "authorAgentCredentialId" TEXT,
ADD COLUMN "authorAgentCredentialLabel" VARCHAR(80);

CREATE INDEX "TaskComment_authorAgentCredentialId_idx" ON "TaskComment"("authorAgentCredentialId");

ALTER TABLE "TaskComment"
ADD CONSTRAINT "TaskComment_authorAgentCredentialId_fkey"
FOREIGN KEY ("authorAgentCredentialId") REFERENCES "ApiCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE;
