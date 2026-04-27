CREATE TYPE "RoadmapMilestoneStatus" AS ENUM ('planned', 'active', 'reached');

CREATE TABLE "RoadmapMilestone" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "targetDate" DATE,
    "status" "RoadmapMilestoneStatus" NOT NULL DEFAULT 'planned',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoadmapMilestone_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RoadmapMilestone_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "RoadmapMilestone_projectId_idx" ON "RoadmapMilestone"("projectId");
CREATE INDEX "RoadmapMilestone_projectId_position_idx" ON "RoadmapMilestone"("projectId", "position");
CREATE INDEX "RoadmapMilestone_projectId_targetDate_idx" ON "RoadmapMilestone"("projectId", "targetDate");

ALTER TABLE "RoadmapMilestone" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RoadmapMilestone" FORCE ROW LEVEL SECURITY;

CREATE POLICY roadmap_milestone_select_policy ON "RoadmapMilestone"
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM "Project" p
    WHERE p.id = "RoadmapMilestone"."projectId"
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

CREATE POLICY roadmap_milestone_insert_policy ON "RoadmapMilestone"
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM "Project" p
    WHERE p.id = "RoadmapMilestone"."projectId"
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

CREATE POLICY roadmap_milestone_update_policy ON "RoadmapMilestone"
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM "Project" p
    WHERE p.id = "RoadmapMilestone"."projectId"
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
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM "Project" p
    WHERE p.id = "RoadmapMilestone"."projectId"
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

CREATE POLICY roadmap_milestone_delete_policy ON "RoadmapMilestone"
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM "Project" p
    WHERE p.id = "RoadmapMilestone"."projectId"
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
