-- ND-185 / TASK-343: epic leadership and initiative accountability.
-- Attribute epic create/update mutations to the acting ApiCredential with a
-- durable label snapshot (mirroring TASK-337 on Task), and add a reassignable
-- initiative lead (human project member or active project agent credential).
-- Existing epics predate actor capture, so creator, last editor, and lead are
-- backfilled from the project owner; the lead stays visible and reassignable.

ALTER TABLE "Epic"
ADD COLUMN "createdByUserId" TEXT,
ADD COLUMN "updatedByUserId" TEXT,
ADD COLUMN "createdByCredentialId" TEXT,
ADD COLUMN "createdByCredentialLabel" VARCHAR(80),
ADD COLUMN "updatedByCredentialId" TEXT,
ADD COLUMN "updatedByCredentialLabel" VARCHAR(80),
ADD COLUMN "leadKind" "ProjectActorKind",
ADD COLUMN "leadUserId" TEXT,
ADD COLUMN "leadCredentialId" TEXT,
ADD COLUMN "leadDisplayNameSnapshot" VARCHAR(80),
ADD COLUMN "leadAssignedByKind" "ProjectActorKind",
ADD COLUMN "leadAssignedByUserId" TEXT,
ADD COLUMN "leadAssignedByCredentialId" TEXT,
ADD COLUMN "leadAssignedByDisplayNameSnapshot" VARCHAR(80),
ADD COLUMN "leadAssignedAt" TIMESTAMP(3);

UPDATE "Epic" epic
SET
  "createdByUserId" = project."ownerId",
  "updatedByUserId" = project."ownerId",
  "leadKind" = 'human',
  "leadUserId" = project."ownerId",
  "leadDisplayNameSnapshot" = COALESCE(
    NULLIF(BTRIM(owner."name"), ''),
    CASE
      WHEN NULLIF(BTRIM(owner."username"), '') IS NOT NULL
        AND NULLIF(BTRIM(owner."usernameDiscriminator"), '') IS NOT NULL
      THEN LEFT(
        BTRIM(owner."username") || '#' || BTRIM(owner."usernameDiscriminator"),
        80
      )
      ELSE NULL
    END,
    NULLIF(BTRIM(owner."email"), ''),
    'Project owner'
  )
FROM "Project" project
JOIN "User" owner ON owner."id" = project."ownerId"
WHERE epic."projectId" = project."id";

ALTER TABLE "Epic"
ALTER COLUMN "createdByUserId" SET NOT NULL,
ALTER COLUMN "updatedByUserId" SET NOT NULL;

ALTER TABLE "Epic"
  ADD CONSTRAINT "Epic_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Epic_updatedByUserId_fkey"
    FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Epic_createdByCredentialId_fkey"
    FOREIGN KEY ("createdByCredentialId") REFERENCES "ApiCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Epic_updatedByCredentialId_fkey"
    FOREIGN KEY ("updatedByCredentialId") REFERENCES "ApiCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Epic_leadUserId_fkey"
    FOREIGN KEY ("leadUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Epic_leadCredentialId_fkey"
    FOREIGN KEY ("leadCredentialId") REFERENCES "ApiCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Epic_leadAssignedByUserId_fkey"
    FOREIGN KEY ("leadAssignedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Epic_leadAssignedByCredentialId_fkey"
    FOREIGN KEY ("leadAssignedByCredentialId") REFERENCES "ApiCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Epic_lead_actor_check"
    CHECK (
      ("leadKind" IS NULL AND "leadUserId" IS NULL AND "leadCredentialId" IS NULL AND "leadDisplayNameSnapshot" IS NULL)
      OR (
        "leadKind" IS NOT NULL
        AND "leadDisplayNameSnapshot" IS NOT NULL
        AND num_nonnulls("leadUserId", "leadCredentialId") <= 1
        AND ("leadKind" = 'human' OR "leadUserId" IS NULL)
        AND ("leadKind" = 'agent' OR "leadCredentialId" IS NULL)
      )
    ),
  ADD CONSTRAINT "Epic_lead_provenance_check"
    CHECK (
      ("leadAssignedByKind" IS NULL AND "leadAssignedByUserId" IS NULL AND "leadAssignedByCredentialId" IS NULL AND "leadAssignedByDisplayNameSnapshot" IS NULL AND "leadAssignedAt" IS NULL)
      OR (
        "leadAssignedByKind" IS NOT NULL
        AND "leadAssignedByDisplayNameSnapshot" IS NOT NULL
        AND "leadAssignedAt" IS NOT NULL
        AND num_nonnulls("leadAssignedByUserId", "leadAssignedByCredentialId") <= 1
        AND ("leadAssignedByKind" = 'human' OR "leadAssignedByUserId" IS NULL)
        AND ("leadAssignedByKind" = 'agent' OR "leadAssignedByCredentialId" IS NULL)
      )
    );

CREATE INDEX "Epic_createdByUserId_idx" ON "Epic"("createdByUserId");
CREATE INDEX "Epic_updatedByUserId_idx" ON "Epic"("updatedByUserId");
CREATE INDEX "Epic_leadUserId_idx" ON "Epic"("leadUserId");
CREATE INDEX "Epic_leadCredentialId_idx" ON "Epic"("leadCredentialId");
