-- CreateTable
CREATE TABLE "ProjectActivityEvent" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "domain" VARCHAR(40) NOT NULL,
    "action" VARCHAR(40) NOT NULL,
    "entityId" VARCHAR(128) NOT NULL,
    "version" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectActivityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectActivityEvent_projectId_version_idx" ON "ProjectActivityEvent"("projectId", "version");

-- CreateIndex
CREATE INDEX "ProjectActivityEvent_projectId_createdAt_idx" ON "ProjectActivityEvent"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectActivityEvent_domain_action_idx" ON "ProjectActivityEvent"("domain", "action");

-- CreateIndex
CREATE INDEX "ProjectActivityEvent_actorUserId_idx" ON "ProjectActivityEvent"("actorUserId");

-- AddForeignKey
ALTER TABLE "ProjectActivityEvent" ADD CONSTRAINT "ProjectActivityEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectActivityEvent" ADD CONSTRAINT "ProjectActivityEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProjectActivityEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProjectActivityEvent" FORCE ROW LEVEL SECURITY;

CREATE POLICY project_activity_event_select_policy ON "ProjectActivityEvent"
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM "Project" p
    WHERE p.id = "ProjectActivityEvent"."projectId"
      AND (
        p."ownerId" = app.current_user_id()
        OR EXISTS (
          SELECT 1
          FROM "ProjectMembership" pm
          WHERE pm."projectId" = p.id
            AND pm."userId" = app.current_user_id()
        )
      )
  )
);

CREATE POLICY project_activity_event_insert_policy ON "ProjectActivityEvent"
FOR INSERT
WITH CHECK (
  "actorUserId" = app.current_user_id()
  AND EXISTS (
    SELECT 1
    FROM "Project" p
    WHERE p.id = "ProjectActivityEvent"."projectId"
      AND (
        p."ownerId" = app.current_user_id()
        OR EXISTS (
          SELECT 1
          FROM "ProjectMembership" pm
          WHERE pm."projectId" = p.id
            AND pm."userId" = app.current_user_id()
            AND pm.role IN ('owner', 'editor')
        )
      )
  )
);
