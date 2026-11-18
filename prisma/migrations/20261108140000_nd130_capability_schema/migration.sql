-- Additive: existing memberships and invitations keep their legacy role preset.
ALTER TABLE "ProjectMembership" ADD COLUMN "capabilities" JSONB;
ALTER TABLE "ProjectInvitation" ADD COLUMN "capabilities" JSONB;
ALTER TYPE "ApiCredentialScope" ADD VALUE 'meeting_read';
ALTER TYPE "ApiCredentialScope" ADD VALUE 'meeting_write';
ALTER TYPE "ApiCredentialScope" ADD VALUE 'meeting_delete';
ALTER TYPE "ApiCredentialScope" ADD VALUE 'epic_read';
ALTER TYPE "ApiCredentialScope" ADD VALUE 'epic_write';
ALTER TYPE "ApiCredentialScope" ADD VALUE 'epic_delete';
ALTER TYPE "ApiCredentialScope" ADD VALUE 'schedule_read';
ALTER TYPE "ApiCredentialScope" ADD VALUE 'schedule_write';
ALTER TYPE "ApiCredentialScope" ADD VALUE 'schedule_delete';
