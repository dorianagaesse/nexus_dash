ALTER TABLE "TaskAttachment"
  ADD COLUMN "uploadedByCredentialId" TEXT,
  ADD COLUMN "uploadedByKind" "ContextCardActorKind" NOT NULL DEFAULT 'human',
  ADD COLUMN "uploadedByDisplayNameSnapshot" VARCHAR(80) NOT NULL DEFAULT 'Unknown uploader';
UPDATE "TaskAttachment" a SET "uploadedByDisplayNameSnapshot" = LEFT(COALESCE(NULLIF(u."username", ''), NULLIF(u."name", ''), NULLIF(split_part(u."email", '@', 1), ''), 'Unknown uploader'), 80)
FROM "User" u WHERE u.id = a."uploadedByUserId";
ALTER TABLE "TaskAttachment" ADD CONSTRAINT "TaskAttachment_uploadedByCredentialId_fkey" FOREIGN KEY ("uploadedByCredentialId") REFERENCES "ApiCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "TaskAttachment_uploadedByCredentialId_idx" ON "TaskAttachment"("uploadedByCredentialId");
