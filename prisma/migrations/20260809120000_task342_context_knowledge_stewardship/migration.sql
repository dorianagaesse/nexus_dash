CREATE TYPE "ContextCardActorKind" AS ENUM ('human', 'agent');

ALTER TABLE "Resource"
  ADD COLUMN "createdByUserId" TEXT,
  ADD COLUMN "createdByCredentialId" TEXT,
  ADD COLUMN "creatorKind" "ContextCardActorKind" NOT NULL DEFAULT 'human',
  ADD COLUMN "creatorDisplayNameSnapshot" VARCHAR(80) NOT NULL DEFAULT 'Unknown actor',
  ADD COLUMN "lastEditedByUserId" TEXT,
  ADD COLUMN "lastEditedByCredentialId" TEXT,
  ADD COLUMN "lastEditorKind" "ContextCardActorKind",
  ADD COLUMN "lastEditorDisplayNameSnapshot" VARCHAR(80),
  ADD COLUMN "stewardUserId" TEXT,
  ADD COLUMN "stewardCredentialId" TEXT,
  ADD COLUMN "stewardKind" "ContextCardActorKind",
  ADD COLUMN "stewardDisplayNameSnapshot" VARCHAR(80),
  ADD COLUMN "updatedAt" TIMESTAMP(3);

UPDATE "Resource"
SET "updatedAt" = "createdAt"
WHERE "updatedAt" IS NULL;

ALTER TABLE "Resource"
  ALTER COLUMN "updatedAt" SET NOT NULL,
  ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Resource"
  ADD CONSTRAINT "Resource_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Resource_createdByCredentialId_fkey"
    FOREIGN KEY ("createdByCredentialId") REFERENCES "ApiCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Resource_lastEditedByUserId_fkey"
    FOREIGN KEY ("lastEditedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Resource_lastEditedByCredentialId_fkey"
    FOREIGN KEY ("lastEditedByCredentialId") REFERENCES "ApiCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Resource_stewardUserId_fkey"
    FOREIGN KEY ("stewardUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Resource_stewardCredentialId_fkey"
    FOREIGN KEY ("stewardCredentialId") REFERENCES "ApiCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Resource_creator_actor_check"
    CHECK (
      num_nonnulls("createdByUserId", "createdByCredentialId") <= 1
      AND ("creatorKind" = 'human' OR "createdByUserId" IS NULL)
      AND ("creatorKind" = 'agent' OR "createdByCredentialId" IS NULL)
    ),
  ADD CONSTRAINT "Resource_last_editor_actor_check"
    CHECK (
      (
        "lastEditorKind" IS NULL
        AND "lastEditedByUserId" IS NULL
        AND "lastEditedByCredentialId" IS NULL
        AND "lastEditorDisplayNameSnapshot" IS NULL
      )
      OR (
        "lastEditorKind" IS NOT NULL
        AND "lastEditorDisplayNameSnapshot" IS NOT NULL
        AND num_nonnulls("lastEditedByUserId", "lastEditedByCredentialId") <= 1
        AND ("lastEditorKind" = 'human' OR "lastEditedByUserId" IS NULL)
        AND ("lastEditorKind" = 'agent' OR "lastEditedByCredentialId" IS NULL)
      )
    ),
  ADD CONSTRAINT "Resource_steward_actor_check"
    CHECK (
      ("stewardKind" IS NULL AND "stewardUserId" IS NULL AND "stewardCredentialId" IS NULL AND "stewardDisplayNameSnapshot" IS NULL)
      OR (
        "stewardKind" IS NOT NULL
        AND "stewardDisplayNameSnapshot" IS NOT NULL
        AND num_nonnulls("stewardUserId", "stewardCredentialId") <= 1
        AND ("stewardKind" = 'human' OR "stewardUserId" IS NULL)
        AND ("stewardKind" = 'agent' OR "stewardCredentialId" IS NULL)
      )
    );

CREATE INDEX "Resource_createdByUserId_idx"
  ON "Resource"("createdByUserId");
CREATE INDEX "Resource_createdByCredentialId_idx"
  ON "Resource"("createdByCredentialId");
CREATE INDEX "Resource_lastEditedByUserId_idx"
  ON "Resource"("lastEditedByUserId");
CREATE INDEX "Resource_lastEditedByCredentialId_idx"
  ON "Resource"("lastEditedByCredentialId");
CREATE INDEX "Resource_stewardUserId_idx"
  ON "Resource"("stewardUserId");
CREATE INDEX "Resource_stewardCredentialId_idx"
  ON "Resource"("stewardCredentialId");
CREATE INDEX "Resource_projectId_updatedAt_idx"
  ON "Resource"("projectId", "updatedAt");

ALTER TABLE "ResourceAttachment"
  ADD COLUMN "uploadedByKind" "ContextCardActorKind" NOT NULL DEFAULT 'human',
  ADD COLUMN "uploadedByDisplayNameSnapshot" VARCHAR(80) NOT NULL DEFAULT 'Unknown uploader';

UPDATE "ResourceAttachment"
SET "uploadedByDisplayNameSnapshot" = LEFT(
  COALESCE(
    NULLIF("user"."username", ''),
    NULLIF("user"."name", ''),
    NULLIF("user"."email", ''),
    'Unknown uploader'
  ),
  80
)
FROM "User" AS "user"
WHERE "ResourceAttachment"."uploadedByUserId" = "user"."id";

ALTER TABLE "ResourceAttachment"
  ADD CONSTRAINT "ResourceAttachment_uploader_actor_check"
    CHECK (
      "uploadedByUserId" IS NOT NULL
      AND "uploadedByKind" = 'human'
      AND "uploadedByDisplayNameSnapshot" IS NOT NULL
    );
