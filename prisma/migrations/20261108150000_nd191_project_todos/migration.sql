CREATE TABLE "ProjectTodo" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectId" TEXT NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "content" VARCHAR(500) NOT NULL CHECK (length(btrim("content")) > 0),
  "completedAt" TIMESTAMP(3),
  "createdByUserId" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "ProjectTodo_projectId_createdAt_id_idx" ON "ProjectTodo"("projectId", "createdAt", "id");
ALTER TABLE "ProjectTodo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProjectTodo" FORCE ROW LEVEL SECURITY;
CREATE POLICY project_todo_select ON "ProjectTodo" FOR SELECT
USING (EXISTS (SELECT 1 FROM "Project" p WHERE p.id = "ProjectTodo"."projectId" AND
      (p."ownerId" = app.current_user_id() OR EXISTS (SELECT 1 FROM "ProjectMembership" pm
        WHERE pm."projectId" = p.id AND pm."userId" = app.current_user_id()))))
;
CREATE POLICY project_todo_insert ON "ProjectTodo" FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM "Project" p WHERE p.id = "ProjectTodo"."projectId" AND
      (p."ownerId" = app.current_user_id() OR EXISTS (SELECT 1 FROM "ProjectMembership" pm
        WHERE pm."projectId" = p.id AND pm."userId" = app.current_user_id() AND pm.role IN ('owner', 'editor')))))
;
CREATE POLICY project_todo_update ON "ProjectTodo" FOR UPDATE
USING (EXISTS (SELECT 1 FROM "Project" p WHERE p.id = "ProjectTodo"."projectId" AND
      (p."ownerId" = app.current_user_id() OR EXISTS (SELECT 1 FROM "ProjectMembership" pm
        WHERE pm."projectId" = p.id AND pm."userId" = app.current_user_id() AND pm.role IN ('owner', 'editor')))))
WITH CHECK (EXISTS (SELECT 1 FROM "Project" p WHERE p.id = "ProjectTodo"."projectId" AND
      (p."ownerId" = app.current_user_id() OR EXISTS (SELECT 1 FROM "ProjectMembership" pm
        WHERE pm."projectId" = p.id AND pm."userId" = app.current_user_id() AND pm.role IN ('owner', 'editor')))))
;
CREATE POLICY project_todo_delete ON "ProjectTodo" FOR DELETE
USING (EXISTS (SELECT 1 FROM "Project" p WHERE p.id = "ProjectTodo"."projectId" AND
      (p."ownerId" = app.current_user_id())))
;
