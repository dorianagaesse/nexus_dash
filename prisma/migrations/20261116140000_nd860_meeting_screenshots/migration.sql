CREATE UNIQUE INDEX "ProjectMeetingNote_id_projectId_key" ON "ProjectMeetingNote"("id", "projectId");
CREATE TABLE "MeetingNoteScreenshot" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectId" TEXT NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "noteId" TEXT,
  "section" VARCHAR(10) NOT NULL CHECK ("section" IN ('input', 'output')),
  "uploadedByUserId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "name" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL CHECK ("sizeBytes" > 0 AND "sizeBytes" <= 4194304),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("noteId", "projectId") REFERENCES "ProjectMeetingNote"("id", "projectId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "MeetingNoteScreenshot_storageKey_key" ON "MeetingNoteScreenshot"("storageKey");
CREATE INDEX "MeetingNoteScreenshot_projectId_noteId_section_idx" ON "MeetingNoteScreenshot"("projectId", "noteId", "section");
CREATE INDEX "MeetingNoteScreenshot_uploadedByUserId_idx" ON "MeetingNoteScreenshot"("uploadedByUserId");
ALTER TABLE "MeetingNoteScreenshot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MeetingNoteScreenshot" FORCE ROW LEVEL SECURITY;

-- Explicit visibility helper prevents the todo-only RLS context from exposing private images.
CREATE POLICY meeting_screenshot_select ON "MeetingNoteScreenshot" FOR SELECT USING (
  EXISTS (SELECT 1 FROM "Project" p WHERE p.id = "projectId" AND
    (p."ownerId" = app.current_user_id() OR EXISTS (
      SELECT 1 FROM "ProjectMembership" pm WHERE pm."projectId" = p.id AND pm."userId" = app.current_user_id())))
  AND CASE WHEN "noteId" IS NULL
    THEN app.is_human_actor() AND "uploadedByUserId" = app.current_user_id()
    ELSE app.meeting_note_is_visible_or_creator("noteId") END
);
CREATE POLICY meeting_screenshot_insert ON "MeetingNoteScreenshot" FOR INSERT WITH CHECK (
  app.is_human_actor() AND "noteId" IS NULL AND "uploadedByUserId" = app.current_user_id()
  AND EXISTS (SELECT 1 FROM "Project" p WHERE p.id = "projectId" AND
    (p."ownerId" = app.current_user_id() OR EXISTS (
      SELECT 1 FROM "ProjectMembership" pm WHERE pm."projectId" = p.id
        AND pm."userId" = app.current_user_id() AND pm.role IN ('owner', 'editor'))))
);
CREATE POLICY meeting_screenshot_update ON "MeetingNoteScreenshot" FOR UPDATE USING (
  app.is_human_actor() AND "noteId" IS NULL AND "uploadedByUserId" = app.current_user_id()
  AND EXISTS (SELECT 1 FROM "Project" p WHERE p.id = "projectId" AND
    (p."ownerId" = app.current_user_id() OR EXISTS (
      SELECT 1 FROM "ProjectMembership" pm WHERE pm."projectId" = p.id
        AND pm."userId" = app.current_user_id() AND pm.role IN ('owner', 'editor'))))
) WITH CHECK (
  app.is_human_actor() AND "uploadedByUserId" = app.current_user_id()
  AND "noteId" IS NOT NULL AND app.meeting_note_is_visible_or_creator("noteId")
  AND EXISTS (SELECT 1 FROM "Project" p WHERE p.id = "projectId" AND
    (p."ownerId" = app.current_user_id() OR EXISTS (
      SELECT 1 FROM "ProjectMembership" pm WHERE pm."projectId" = p.id
        AND pm."userId" = app.current_user_id() AND pm.role IN ('owner', 'editor'))))
);
CREATE POLICY meeting_screenshot_delete ON "MeetingNoteScreenshot" FOR DELETE USING (
  app.is_human_actor()
  AND CASE WHEN "noteId" IS NULL THEN "uploadedByUserId" = app.current_user_id()
    ELSE app.meeting_note_is_visible_or_creator("noteId") END
  AND EXISTS (SELECT 1 FROM "Project" p WHERE p.id = "projectId" AND
    (p."ownerId" = app.current_user_id() OR EXISTS (
      SELECT 1 FROM "ProjectMembership" pm WHERE pm."projectId" = p.id
        AND pm."userId" = app.current_user_id() AND pm.role IN ('owner', 'editor'))))
);

-- Screenshot-only edits participate in the existing conditional-write contract.
CREATE FUNCTION public.nd_meeting_screenshot_revision() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE "ProjectMeetingNote" SET "contentRevision" = "contentRevision" + 1, "updatedAt" = NOW(), "updatedByUserId" = COALESCE(app.current_user_id(), "updatedByUserId") WHERE id = OLD."noteId";
    RETURN OLD;
  END IF;
  UPDATE "ProjectMeetingNote" SET "contentRevision" = "contentRevision" + 1, "updatedAt" = NOW(), "updatedByUserId" = COALESCE(app.current_user_id(), "updatedByUserId") WHERE id = NEW."noteId";
  RETURN NEW;
END;
$$;
CREATE TRIGGER meeting_screenshot_revision AFTER UPDATE OR DELETE ON "MeetingNoteScreenshot"
FOR EACH ROW EXECUTE FUNCTION public.nd_meeting_screenshot_revision();

CREATE FUNCTION public.nd_meeting_screenshot_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - 'noteId') IS DISTINCT FROM (to_jsonb(OLD) - 'noteId')
    OR OLD."noteId" IS NOT NULL THEN
    RAISE EXCEPTION 'Screenshot metadata and saved ownership are immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER meeting_screenshot_guard BEFORE UPDATE ON "MeetingNoteScreenshot"
FOR EACH ROW EXECUTE FUNCTION public.nd_meeting_screenshot_guard();

CREATE POLICY meeting_screenshot_read_capability ON "MeetingNoteScreenshot" AS RESTRICTIVE FOR SELECT
USING (app.has_project_capability("projectId", 'meeting:read'));
CREATE POLICY meeting_screenshot_insert_capability ON "MeetingNoteScreenshot" AS RESTRICTIVE FOR INSERT
WITH CHECK (app.has_project_capability("projectId", 'meeting:write'));
CREATE POLICY meeting_screenshot_update_capability ON "MeetingNoteScreenshot" AS RESTRICTIVE FOR UPDATE
USING (app.has_project_capability("projectId", 'meeting:write'))
WITH CHECK (app.has_project_capability("projectId", 'meeting:write'));
CREATE POLICY meeting_screenshot_delete_capability ON "MeetingNoteScreenshot" AS RESTRICTIVE FOR DELETE
USING (app.has_project_capability("projectId", 'meeting:write'));
