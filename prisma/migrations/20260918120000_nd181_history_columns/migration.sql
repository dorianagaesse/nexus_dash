-- AlterTable
ALTER TABLE "ProjectActivityEvent"
  ADD COLUMN "actorCredentialId" TEXT,
  ADD COLUMN "actorKind" "ProjectActorKind",
  ADD COLUMN "actorDisplayNameSnapshot" VARCHAR(80),
  ADD COLUMN "entityDisplayNameSnapshot" VARCHAR(160),
  ADD COLUMN "summary" VARCHAR(280),
  ADD COLUMN "changes" JSONB;

-- AddForeignKey
ALTER TABLE "ProjectActivityEvent" ADD CONSTRAINT "ProjectActivityEvent_actorCredentialId_fkey" FOREIGN KEY ("actorCredentialId") REFERENCES "ApiCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "ProjectActivityEvent_actorCredentialId_idx" ON "ProjectActivityEvent"("actorCredentialId");

-- CreateIndex
CREATE INDEX "ProjectActivityEvent_createdAt_idx" ON "ProjectActivityEvent"("createdAt");
