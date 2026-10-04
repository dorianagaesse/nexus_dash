-- ND-185: attribute epic create/update mutations to the acting user and
-- ApiCredential with a durable label snapshot (mirroring the Task model).
-- Epics predate actor capture, so created/updated attribution is backfilled
-- from the project owner.

ALTER TABLE "Epic"
ADD COLUMN "createdByUserId" TEXT,
ADD COLUMN "updatedByUserId" TEXT,
ADD COLUMN "createdByCredentialId" TEXT,
ADD COLUMN "createdByCredentialLabel" VARCHAR(80),
ADD COLUMN "updatedByCredentialId" TEXT,
ADD COLUMN "updatedByCredentialLabel" VARCHAR(80);

UPDATE "Epic" AS epic
SET
  "createdByUserId" = project."ownerId",
  "updatedByUserId" = project."ownerId"
FROM "Project" AS project
WHERE project.id = epic."projectId";

ALTER TABLE "Epic"
ALTER COLUMN "createdByUserId" SET NOT NULL,
ALTER COLUMN "updatedByUserId" SET NOT NULL;

CREATE INDEX "Epic_createdByUserId_idx" ON "Epic"("createdByUserId");
CREATE INDEX "Epic_updatedByUserId_idx" ON "Epic"("updatedByUserId");
CREATE INDEX "Epic_createdByCredentialId_idx" ON "Epic"("createdByCredentialId");
CREATE INDEX "Epic_updatedByCredentialId_idx" ON "Epic"("updatedByCredentialId");

ALTER TABLE "Epic"
ADD CONSTRAINT "Epic_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Epic"
ADD CONSTRAINT "Epic_updatedByUserId_fkey"
FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Epic"
ADD CONSTRAINT "Epic_createdByCredentialId_fkey"
FOREIGN KEY ("createdByCredentialId") REFERENCES "ApiCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Epic"
ADD CONSTRAINT "Epic_updatedByCredentialId_fkey"
FOREIGN KEY ("updatedByCredentialId") REFERENCES "ApiCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE;
