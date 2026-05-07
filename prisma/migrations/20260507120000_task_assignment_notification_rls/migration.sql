DROP POLICY IF EXISTS notification_insert_policy ON "Notification";
DROP POLICY IF EXISTS notification_update_policy ON "Notification";

CREATE POLICY notification_insert_policy ON "Notification"
FOR INSERT
WITH CHECK (
  "recipientUserId" = app.current_user_id()
  OR (
    "sourceType" = 'project_invitation'
    AND EXISTS (
      SELECT 1
      FROM "ProjectInvitation" pi
      JOIN "User" recipient_user
        ON recipient_user.id = "Notification"."recipientUserId"
      WHERE pi.id = "Notification"."sourceId"
        AND pi."invitedByUserId" = app.current_user_id()
        AND recipient_user.email IS NOT NULL
        AND pi."invitedEmail" = recipient_user.email
    )
  )
  OR (
    "sourceType" = 'task_comment_mention'
    AND EXISTS (
      SELECT 1
      FROM "TaskComment" tc
      JOIN "Task" t ON t.id = tc."taskId"
      JOIN "Project" p ON p.id = t."projectId"
      WHERE tc.id = "Notification"."sourceId"
        AND tc."authorUserId" = app.current_user_id()
        AND (
          p."ownerId" = "Notification"."recipientUserId"
          OR EXISTS (
            SELECT 1
            FROM "ProjectMembership" pm
            WHERE pm."projectId" = p.id
              AND pm."userId" = "Notification"."recipientUserId"
          )
        )
    )
  )
  OR (
    "sourceType" = 'task_assignment'
    AND EXISTS (
      SELECT 1
      FROM "Task" t
      JOIN "Project" p ON p.id = t."projectId"
      WHERE t.id = "Notification"."sourceId"
        AND (
          p."ownerId" = app.current_user_id()
          OR EXISTS (
            SELECT 1
            FROM "ProjectMembership" actor_membership
            WHERE actor_membership."projectId" = p.id
              AND actor_membership."userId" = app.current_user_id()
              AND actor_membership.role IN ('owner', 'editor')
          )
        )
        AND (
          p."ownerId" = "Notification"."recipientUserId"
          OR EXISTS (
            SELECT 1
            FROM "ProjectMembership" recipient_membership
            WHERE recipient_membership."projectId" = p.id
              AND recipient_membership."userId" = "Notification"."recipientUserId"
          )
        )
    )
  )
);

CREATE POLICY notification_update_policy ON "Notification"
FOR UPDATE
USING (
  "recipientUserId" = app.current_user_id()
  OR (
    "sourceType" = 'project_invitation'
    AND EXISTS (
      SELECT 1
      FROM "ProjectInvitation" pi
      JOIN "User" recipient_user
        ON recipient_user.id = "Notification"."recipientUserId"
      WHERE pi.id = "Notification"."sourceId"
        AND pi."invitedByUserId" = app.current_user_id()
        AND recipient_user.email IS NOT NULL
        AND pi."invitedEmail" = recipient_user.email
    )
  )
  OR (
    "sourceType" = 'task_comment_mention'
    AND EXISTS (
      SELECT 1
      FROM "TaskComment" tc
      JOIN "Task" t ON t.id = tc."taskId"
      JOIN "Project" p ON p.id = t."projectId"
      WHERE tc.id = "Notification"."sourceId"
        AND tc."authorUserId" = app.current_user_id()
        AND (
          p."ownerId" = "Notification"."recipientUserId"
          OR EXISTS (
            SELECT 1
            FROM "ProjectMembership" pm
            WHERE pm."projectId" = p.id
              AND pm."userId" = "Notification"."recipientUserId"
          )
        )
    )
  )
  OR (
    "sourceType" = 'task_assignment'
    AND EXISTS (
      SELECT 1
      FROM "Task" t
      JOIN "Project" p ON p.id = t."projectId"
      WHERE t.id = "Notification"."sourceId"
        AND (
          p."ownerId" = app.current_user_id()
          OR EXISTS (
            SELECT 1
            FROM "ProjectMembership" actor_membership
            WHERE actor_membership."projectId" = p.id
              AND actor_membership."userId" = app.current_user_id()
              AND actor_membership.role IN ('owner', 'editor')
          )
        )
        AND (
          p."ownerId" = "Notification"."recipientUserId"
          OR EXISTS (
            SELECT 1
            FROM "ProjectMembership" recipient_membership
            WHERE recipient_membership."projectId" = p.id
              AND recipient_membership."userId" = "Notification"."recipientUserId"
          )
        )
    )
  )
)
WITH CHECK (
  "recipientUserId" = app.current_user_id()
  OR (
    "sourceType" = 'project_invitation'
    AND EXISTS (
      SELECT 1
      FROM "ProjectInvitation" pi
      JOIN "User" recipient_user
        ON recipient_user.id = "Notification"."recipientUserId"
      WHERE pi.id = "Notification"."sourceId"
        AND pi."invitedByUserId" = app.current_user_id()
        AND recipient_user.email IS NOT NULL
        AND pi."invitedEmail" = recipient_user.email
    )
  )
  OR (
    "sourceType" = 'task_comment_mention'
    AND EXISTS (
      SELECT 1
      FROM "TaskComment" tc
      JOIN "Task" t ON t.id = tc."taskId"
      JOIN "Project" p ON p.id = t."projectId"
      WHERE tc.id = "Notification"."sourceId"
        AND tc."authorUserId" = app.current_user_id()
        AND (
          p."ownerId" = "Notification"."recipientUserId"
          OR EXISTS (
            SELECT 1
            FROM "ProjectMembership" pm
            WHERE pm."projectId" = p.id
              AND pm."userId" = "Notification"."recipientUserId"
          )
        )
    )
  )
  OR (
    "sourceType" = 'task_assignment'
    AND EXISTS (
      SELECT 1
      FROM "Task" t
      JOIN "Project" p ON p.id = t."projectId"
      WHERE t.id = "Notification"."sourceId"
        AND (
          p."ownerId" = app.current_user_id()
          OR EXISTS (
            SELECT 1
            FROM "ProjectMembership" actor_membership
            WHERE actor_membership."projectId" = p.id
              AND actor_membership."userId" = app.current_user_id()
              AND actor_membership.role IN ('owner', 'editor')
          )
        )
        AND (
          p."ownerId" = "Notification"."recipientUserId"
          OR EXISTS (
            SELECT 1
            FROM "ProjectMembership" recipient_membership
            WHERE recipient_membership."projectId" = p.id
              AND recipient_membership."userId" = "Notification"."recipientUserId"
          )
        )
    )
  )
);
