-- The previous ND-185 migration reached the shared Preview database before
-- epic leadership and history were withdrawn. Keep that applied migration in
-- history and move the contract to attribution-only with a forward migration.
BEGIN;

ALTER TABLE "Epic"
  DROP CONSTRAINT "Epic_lead_actor_check",
  DROP CONSTRAINT "Epic_lead_provenance_check";

DROP INDEX "Epic_leadUserId_idx";
DROP INDEX "Epic_leadCredentialId_idx";
DROP INDEX "ProjectActivityEvent_projectId_domain_entityId_version_idx";

ALTER TABLE "Epic"
  DROP COLUMN "leadKind",
  DROP COLUMN "leadUserId",
  DROP COLUMN "leadCredentialId",
  DROP COLUMN "leadDisplayNameSnapshot",
  DROP COLUMN "leadAssignedByKind",
  DROP COLUMN "leadAssignedByUserId",
  DROP COLUMN "leadAssignedByCredentialId",
  DROP COLUMN "leadAssignedByDisplayNameSnapshot",
  DROP COLUMN "leadAssignedAt";

CREATE INDEX "Epic_createdByCredentialId_idx" ON "Epic"("createdByCredentialId");
CREATE INDEX "Epic_updatedByCredentialId_idx" ON "Epic"("updatedByCredentialId");

COMMIT;
