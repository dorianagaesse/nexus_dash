-- Notification copies remain subject to the recipient's current module grants.
ALTER TABLE "User" ADD COLUMN "notificationAccessUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE FUNCTION app.notification_recipient_can_read(recipient_id TEXT, notification_type TEXT, notification_metadata JSONB)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN notification_type NOT IN ('task_assignment', 'task_comment_mention', 'task_due_date_reminder', 'meeting_todo_overdue_reminder') THEN true
    ELSE EXISTS (
      SELECT 1 FROM "Project" p LEFT JOIN "ProjectMembership" m
        ON m."projectId" = p.id AND m."userId" = recipient_id
      WHERE p.id = notification_metadata->>'projectId' AND (
        p."ownerId" = recipient_id OR (m.id IS NOT NULL AND (
          m.capabilities IS NULL OR (jsonb_typeof(m.capabilities) = 'array' AND
          m.capabilities ? CASE WHEN notification_type = 'meeting_todo_overdue_reminder' THEN 'meeting:read' ELSE 'task:read' END)
        ))
      )
    )
  END;
$$;

CREATE POLICY nd130_notification_select ON "Notification" AS RESTRICTIVE FOR SELECT
USING (app.notification_recipient_can_read("recipientUserId", type, metadata));
CREATE POLICY nd130_notification_insert ON "Notification" AS RESTRICTIVE FOR INSERT
WITH CHECK (app.notification_recipient_can_read("recipientUserId", type, metadata));
CREATE POLICY nd130_notification_update ON "Notification" AS RESTRICTIVE FOR UPDATE
USING (app.notification_recipient_can_read("recipientUserId", type, metadata))
WITH CHECK (app.notification_recipient_can_read("recipientUserId", type, metadata));

-- This definer-owned snapshot bypasses table RLS, so filter its copies explicitly.
-- The access cursor ensures revocation never produces an older client version.
CREATE OR REPLACE FUNCTION app.build_notification_realtime_snapshot(recipient_user_id TEXT)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  WITH visible AS (
    SELECT n.* FROM public."Notification" n WHERE n."recipientUserId" = recipient_user_id
      AND app.notification_recipient_can_read(recipient_user_id, n.type, n.metadata)
  )
  SELECT jsonb_build_object(
    'version', to_char(GREATEST(
      COALESCE((SELECT max("updatedAt") FROM visible), '1970-01-01'::timestamp),
      COALESCE((SELECT "notificationAccessUpdatedAt" FROM public."User" WHERE id = recipient_user_id), '1970-01-01'::timestamp)
    ) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'unreadCount', (SELECT count(*) FROM visible WHERE "readAt" IS NULL AND "resolvedAt" IS NULL),
    'latestUnreadNotification', (SELECT jsonb_build_object('title', title) FROM visible
      WHERE "readAt" IS NULL AND "resolvedAt" IS NULL ORDER BY "createdAt" DESC LIMIT 1),
    'serverTime', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
$$;
REVOKE ALL ON FUNCTION app.build_notification_realtime_snapshot(TEXT) FROM PUBLIC;

CREATE FUNCTION app.refresh_notification_access(recipient_id TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  UPDATE public."User" SET "notificationAccessUpdatedAt" = GREATEST(
    "notificationAccessUpdatedAt" + interval '1 millisecond', clock_timestamp()
  ) WHERE id = recipient_id;
  BEGIN
    PERFORM realtime.send(app.build_notification_realtime_snapshot(recipient_id),
      'notification-snapshot', 'user:' || recipient_id || ':notifications', true);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notification access Broadcast failed: %', SQLERRM;
  END;
END;
$$;
REVOKE ALL ON FUNCTION app.refresh_notification_access(TEXT) FROM PUBLIC;

CREATE FUNCTION app.refresh_membership_notification_access()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM app.refresh_notification_access(OLD."userId");
  ELSIF TG_OP = 'INSERT' THEN
    PERFORM app.refresh_notification_access(NEW."userId");
  ELSIF (OLD.role, OLD.capabilities, OLD."projectId", OLD."userId") IS DISTINCT FROM
        (NEW.role, NEW.capabilities, NEW."projectId", NEW."userId") THEN
    PERFORM app.refresh_notification_access(NEW."userId");
    IF OLD."userId" <> NEW."userId" THEN PERFORM app.refresh_notification_access(OLD."userId"); END IF;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER nd130_membership_notification_access AFTER INSERT OR UPDATE OR DELETE ON "ProjectMembership"
FOR EACH ROW EXECUTE FUNCTION app.refresh_membership_notification_access();

CREATE FUNCTION app.refresh_owner_notification_access()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF OLD."ownerId" IS DISTINCT FROM NEW."ownerId" THEN
    PERFORM app.refresh_notification_access(OLD."ownerId");
    PERFORM app.refresh_notification_access(NEW."ownerId");
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER nd130_owner_notification_access AFTER UPDATE OF "ownerId" ON "Project"
FOR EACH ROW EXECUTE FUNCTION app.refresh_owner_notification_access();
