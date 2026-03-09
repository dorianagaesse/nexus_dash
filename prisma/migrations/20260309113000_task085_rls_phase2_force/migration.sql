-- Enforce RLS even for table owners on TASK-085 protected tables.
-- Phase 1 enabled policies without FORCE so preview/staging could soak first.

ALTER TABLE "Project" FORCE ROW LEVEL SECURITY;
ALTER TABLE "ProjectMembership" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Task" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Resource" FORCE ROW LEVEL SECURITY;
ALTER TABLE "TaskBlockedFollowUp" FORCE ROW LEVEL SECURITY;
ALTER TABLE "TaskAttachment" FORCE ROW LEVEL SECURITY;
ALTER TABLE "ResourceAttachment" FORCE ROW LEVEL SECURITY;
ALTER TABLE "GoogleCalendarCredential" FORCE ROW LEVEL SECURITY;
