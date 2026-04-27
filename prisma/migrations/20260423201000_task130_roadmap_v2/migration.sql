CREATE TABLE "RoadmapPhase" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "targetDate" DATE,
    "status" "RoadmapMilestoneStatus" NOT NULL DEFAULT 'planned',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoadmapPhase_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RoadmapPhase_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "RoadmapPhase_id_projectId_key" ON "RoadmapPhase"("id", "projectId");

CREATE TABLE "RoadmapEvent" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "phaseId" TEXT NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "targetDate" DATE,
    "status" "RoadmapMilestoneStatus" NOT NULL DEFAULT 'planned',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoadmapEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RoadmapEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RoadmapEvent_phaseId_projectId_fkey" FOREIGN KEY ("phaseId", "projectId") REFERENCES "RoadmapPhase"("id", "projectId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "RoadmapPhase_projectId_idx" ON "RoadmapPhase"("projectId");
CREATE INDEX "RoadmapPhase_projectId_position_idx" ON "RoadmapPhase"("projectId", "position");
CREATE INDEX "RoadmapPhase_projectId_targetDate_idx" ON "RoadmapPhase"("projectId", "targetDate");

CREATE INDEX "RoadmapEvent_projectId_idx" ON "RoadmapEvent"("projectId");
CREATE INDEX "RoadmapEvent_projectId_targetDate_idx" ON "RoadmapEvent"("projectId", "targetDate");
CREATE INDEX "RoadmapEvent_phaseId_idx" ON "RoadmapEvent"("phaseId");
CREATE INDEX "RoadmapEvent_phaseId_position_idx" ON "RoadmapEvent"("phaseId", "position");

INSERT INTO "RoadmapPhase" (
    "id",
    "projectId",
    "title",
    "description",
    "targetDate",
    "status",
    "position",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "projectId",
    "title",
    "description",
    "targetDate",
    "status",
    "position",
    "createdAt",
    "updatedAt"
FROM "RoadmapMilestone";

INSERT INTO "RoadmapEvent" (
    "id",
    "projectId",
    "phaseId",
    "title",
    "description",
    "targetDate",
    "status",
    "position",
    "createdAt",
    "updatedAt"
)
SELECT
    "id" || '_event',
    "projectId",
    "id",
    "title",
    "description",
    "targetDate",
    "status",
    0,
    "createdAt",
    "updatedAt"
FROM "RoadmapMilestone";

ALTER TABLE "RoadmapPhase" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RoadmapPhase" FORCE ROW LEVEL SECURITY;
ALTER TABLE "RoadmapEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RoadmapEvent" FORCE ROW LEVEL SECURITY;

CREATE POLICY roadmap_phase_select_policy ON "RoadmapPhase"
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM "Project" p
    WHERE p.id = "RoadmapPhase"."projectId"
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

CREATE POLICY roadmap_phase_insert_policy ON "RoadmapPhase"
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM "Project" p
    WHERE p.id = "RoadmapPhase"."projectId"
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

CREATE POLICY roadmap_phase_update_policy ON "RoadmapPhase"
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM "Project" p
    WHERE p.id = "RoadmapPhase"."projectId"
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
    WHERE p.id = "RoadmapPhase"."projectId"
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

CREATE POLICY roadmap_phase_delete_policy ON "RoadmapPhase"
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM "Project" p
    WHERE p.id = "RoadmapPhase"."projectId"
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

CREATE POLICY roadmap_event_select_policy ON "RoadmapEvent"
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM "Project" p
    WHERE p.id = "RoadmapEvent"."projectId"
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

CREATE POLICY roadmap_event_insert_policy ON "RoadmapEvent"
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM "Project" p
    WHERE p.id = "RoadmapEvent"."projectId"
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
  AND EXISTS (
    SELECT 1
    FROM "RoadmapPhase" rp
    WHERE rp.id = "RoadmapEvent"."phaseId"
      AND rp."projectId" = "RoadmapEvent"."projectId"
  )
);

CREATE POLICY roadmap_event_update_policy ON "RoadmapEvent"
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM "Project" p
    WHERE p.id = "RoadmapEvent"."projectId"
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
    WHERE p.id = "RoadmapEvent"."projectId"
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
  AND EXISTS (
    SELECT 1
    FROM "RoadmapPhase" rp
    WHERE rp.id = "RoadmapEvent"."phaseId"
      AND rp."projectId" = "RoadmapEvent"."projectId"
  )
);

CREATE POLICY roadmap_event_delete_policy ON "RoadmapEvent"
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM "Project" p
    WHERE p.id = "RoadmapEvent"."projectId"
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

DROP TABLE "RoadmapMilestone";
