-- Require an explicit owner grant for every credential, regardless of the old
-- project toggle. Existing and future credentials start with Done moves denied.
ALTER TABLE "ApiCredential" ADD COLUMN "canMoveTasksToDone" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Project" DROP COLUMN "agentCanMoveTasksToDone";
