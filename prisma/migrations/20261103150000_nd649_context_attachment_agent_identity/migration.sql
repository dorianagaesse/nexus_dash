-- Keep the owning user for storage/RLS; preserve the actual agent separately.
ALTER TABLE "ResourceAttachment" ADD COLUMN "uploadedByCredentialId" TEXT;
CREATE INDEX "ResourceAttachment_uploadedByCredentialId_idx" ON "ResourceAttachment"("uploadedByCredentialId");
ALTER TABLE "ResourceAttachment" ADD CONSTRAINT "ResourceAttachment_uploadedByCredentialId_fkey"
  FOREIGN KEY ("uploadedByCredentialId") REFERENCES "ApiCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ResourceAttachment" DROP CONSTRAINT "ResourceAttachment_uploader_actor_check";
ALTER TABLE "ResourceAttachment" ADD CONSTRAINT "ResourceAttachment_uploader_actor_check"
  CHECK ("uploadedByUserId" IS NOT NULL AND "uploadedByDisplayNameSnapshot" IS NOT NULL
    AND ("uploadedByKind" = 'agent' OR ("uploadedByKind" = 'human' AND "uploadedByCredentialId" IS NULL)));
