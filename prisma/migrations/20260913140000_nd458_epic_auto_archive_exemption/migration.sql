-- ND-458 review fix: manual restore is durable.
-- Restoring an epic records the moment here; the stale-completion sweep skips
-- epics whose completion moment is not newer than this exemption, so a
-- restored epic stays active until it completes again. Nullable so existing
-- epics keep sweeping normally.

ALTER TABLE "Epic" ADD COLUMN "autoArchiveExemptAt" TIMESTAMP(3);
