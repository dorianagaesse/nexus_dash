-- ND-458: epic archive lifecycle.
-- Completed epics auto-archive after the same 7-day grace period as Done
-- tasks, and the epic panel offers manual archive/restore; archivedAt records
-- the shelf time. Nullable so existing epics stay active.

ALTER TABLE "Epic" ADD COLUMN "archivedAt" TIMESTAMP(3);
