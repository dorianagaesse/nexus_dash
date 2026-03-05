CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.current_user_id()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '');
$$;

ALTER TABLE "Project" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProjectMembership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Task" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Resource" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TaskBlockedFollowUp" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TaskAttachment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ResourceAttachment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GoogleCalendarCredential" ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_select_policy ON "Project"
FOR SELECT
USING (
  "ownerId" = app.current_user_id()
  OR EXISTS (
    SELECT 1
    FROM "ProjectMembership" pm
    WHERE pm."projectId" = "Project".id
      AND pm."userId" = app.current_user_id()
  )
);

CREATE POLICY project_insert_policy ON "Project"
FOR INSERT
WITH CHECK (
  "ownerId" = app.current_user_id()
);

CREATE POLICY project_update_policy ON "Project"
FOR UPDATE
USING (
  "ownerId" = app.current_user_id()
)
WITH CHECK (
  "ownerId" = app.current_user_id()
);

CREATE POLICY project_delete_policy ON "Project"
FOR DELETE
USING (
  "ownerId" = app.current_user_id()
);

CREATE POLICY project_membership_select_policy ON "ProjectMembership"
FOR SELECT
USING (
  "userId" = app.current_user_id()
  OR EXISTS (
    SELECT 1
    FROM "Project" p
    WHERE p.id = "ProjectMembership"."projectId"
      AND p."ownerId" = app.current_user_id()
  )
);

CREATE POLICY project_membership_insert_policy ON "ProjectMembership"
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM "Project" p
    WHERE p.id = "ProjectMembership"."projectId"
      AND p."ownerId" = app.current_user_id()
  )
);

CREATE POLICY project_membership_update_policy ON "ProjectMembership"
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM "Project" p
    WHERE p.id = "ProjectMembership"."projectId"
      AND p."ownerId" = app.current_user_id()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM "Project" p
    WHERE p.id = "ProjectMembership"."projectId"
      AND p."ownerId" = app.current_user_id()
  )
);

CREATE POLICY project_membership_delete_policy ON "ProjectMembership"
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM "Project" p
    WHERE p.id = "ProjectMembership"."projectId"
      AND p."ownerId" = app.current_user_id()
  )
);

CREATE POLICY task_select_policy ON "Task"
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM "Project" p
    WHERE p.id = "Task"."projectId"
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

CREATE POLICY task_insert_policy ON "Task"
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM "Project" p
    WHERE p.id = "Task"."projectId"
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

CREATE POLICY task_update_policy ON "Task"
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM "Project" p
    WHERE p.id = "Task"."projectId"
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
    WHERE p.id = "Task"."projectId"
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

CREATE POLICY task_delete_policy ON "Task"
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM "Project" p
    WHERE p.id = "Task"."projectId"
      AND p."ownerId" = app.current_user_id()
  )
);

CREATE POLICY resource_select_policy ON "Resource"
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM "Project" p
    WHERE p.id = "Resource"."projectId"
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

CREATE POLICY resource_insert_policy ON "Resource"
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM "Project" p
    WHERE p.id = "Resource"."projectId"
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

CREATE POLICY resource_update_policy ON "Resource"
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM "Project" p
    WHERE p.id = "Resource"."projectId"
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
    WHERE p.id = "Resource"."projectId"
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

CREATE POLICY resource_delete_policy ON "Resource"
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM "Project" p
    WHERE p.id = "Resource"."projectId"
      AND p."ownerId" = app.current_user_id()
  )
);

CREATE POLICY task_blocked_follow_up_select_policy ON "TaskBlockedFollowUp"
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM "Task" t
    JOIN "Project" p ON p.id = t."projectId"
    WHERE t.id = "TaskBlockedFollowUp"."taskId"
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

CREATE POLICY task_blocked_follow_up_insert_policy ON "TaskBlockedFollowUp"
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM "Task" t
    JOIN "Project" p ON p.id = t."projectId"
    WHERE t.id = "TaskBlockedFollowUp"."taskId"
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

CREATE POLICY task_blocked_follow_up_update_policy ON "TaskBlockedFollowUp"
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM "Task" t
    JOIN "Project" p ON p.id = t."projectId"
    WHERE t.id = "TaskBlockedFollowUp"."taskId"
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
    FROM "Task" t
    JOIN "Project" p ON p.id = t."projectId"
    WHERE t.id = "TaskBlockedFollowUp"."taskId"
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

CREATE POLICY task_blocked_follow_up_delete_policy ON "TaskBlockedFollowUp"
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM "Task" t
    JOIN "Project" p ON p.id = t."projectId"
    WHERE t.id = "TaskBlockedFollowUp"."taskId"
      AND p."ownerId" = app.current_user_id()
  )
);

CREATE POLICY task_attachment_select_policy ON "TaskAttachment"
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM "Task" t
    JOIN "Project" p ON p.id = t."projectId"
    WHERE t.id = "TaskAttachment"."taskId"
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

CREATE POLICY task_attachment_insert_policy ON "TaskAttachment"
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM "Task" t
    JOIN "Project" p ON p.id = t."projectId"
    WHERE t.id = "TaskAttachment"."taskId"
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

CREATE POLICY task_attachment_update_policy ON "TaskAttachment"
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM "Task" t
    JOIN "Project" p ON p.id = t."projectId"
    WHERE t.id = "TaskAttachment"."taskId"
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
    FROM "Task" t
    JOIN "Project" p ON p.id = t."projectId"
    WHERE t.id = "TaskAttachment"."taskId"
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

CREATE POLICY task_attachment_delete_policy ON "TaskAttachment"
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM "Task" t
    JOIN "Project" p ON p.id = t."projectId"
    WHERE t.id = "TaskAttachment"."taskId"
      AND p."ownerId" = app.current_user_id()
  )
);

CREATE POLICY resource_attachment_select_policy ON "ResourceAttachment"
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM "Resource" r
    JOIN "Project" p ON p.id = r."projectId"
    WHERE r.id = "ResourceAttachment"."resourceId"
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

CREATE POLICY resource_attachment_insert_policy ON "ResourceAttachment"
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM "Resource" r
    JOIN "Project" p ON p.id = r."projectId"
    WHERE r.id = "ResourceAttachment"."resourceId"
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

CREATE POLICY resource_attachment_update_policy ON "ResourceAttachment"
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM "Resource" r
    JOIN "Project" p ON p.id = r."projectId"
    WHERE r.id = "ResourceAttachment"."resourceId"
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
    FROM "Resource" r
    JOIN "Project" p ON p.id = r."projectId"
    WHERE r.id = "ResourceAttachment"."resourceId"
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

CREATE POLICY resource_attachment_delete_policy ON "ResourceAttachment"
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM "Resource" r
    JOIN "Project" p ON p.id = r."projectId"
    WHERE r.id = "ResourceAttachment"."resourceId"
      AND p."ownerId" = app.current_user_id()
  )
);

CREATE POLICY google_calendar_credential_select_policy ON "GoogleCalendarCredential"
FOR SELECT
USING (
  "userId" = app.current_user_id()
);

CREATE POLICY google_calendar_credential_insert_policy ON "GoogleCalendarCredential"
FOR INSERT
WITH CHECK (
  "userId" = app.current_user_id()
);

CREATE POLICY google_calendar_credential_update_policy ON "GoogleCalendarCredential"
FOR UPDATE
USING (
  "userId" = app.current_user_id()
)
WITH CHECK (
  "userId" = app.current_user_id()
);

CREATE POLICY google_calendar_credential_delete_policy ON "GoogleCalendarCredential"
FOR DELETE
USING (
  "userId" = app.current_user_id()
);
