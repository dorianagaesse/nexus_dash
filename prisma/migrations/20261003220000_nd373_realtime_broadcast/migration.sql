-- Private Broadcast is additive: databases without Supabase Realtime retain
-- the existing HTTP/SSE behavior. Business writes must survive send failures.
CREATE OR REPLACE FUNCTION app.current_user_id()
RETURNS TEXT
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('app.user_id', true), ''),
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  );
$$;

CREATE OR REPLACE FUNCTION app.can_receive_project_activity_topic(topic TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    array_length(string_to_array(topic, ':'), 1) = 3
    AND split_part(topic, ':', 1) = 'project'
    AND split_part(topic, ':', 3) = 'activity'
    AND EXISTS (
      SELECT 1 FROM public."Project" p
      WHERE p.id = split_part(topic, ':', 2)
        AND (
          p."ownerId" = app.current_user_id()
          OR EXISTS (
            SELECT 1 FROM public."ProjectMembership" pm
            WHERE pm."projectId" = p.id
              AND pm."userId" = app.current_user_id()
          )
        )
    ), false
  );
$$;

CREATE OR REPLACE FUNCTION app.can_receive_user_notifications_topic(topic TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    array_length(string_to_array(topic, ':'), 1) = 3
    AND split_part(topic, ':', 1) = 'user'
    AND split_part(topic, ':', 3) = 'notifications'
    AND split_part(topic, ':', 2) = app.current_user_id(), false
  );
$$;

CREATE OR REPLACE FUNCTION app.build_notification_realtime_snapshot(recipient_user_id TEXT)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'version', COALESCE(
      (SELECT to_char(n."updatedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
       FROM public."Notification" n
       WHERE n."recipientUserId" = recipient_user_id
       ORDER BY n."updatedAt" DESC LIMIT 1),
      '1970-01-01T00:00:00.000Z'
    ),
    'unreadCount', (SELECT count(*) FROM public."Notification" n
      WHERE n."recipientUserId" = recipient_user_id
        AND n."readAt" IS NULL AND n."resolvedAt" IS NULL),
    'latestUnreadNotification', (SELECT jsonb_build_object('title', n.title)
      FROM public."Notification" n
      WHERE n."recipientUserId" = recipient_user_id
        AND n."readAt" IS NULL AND n."resolvedAt" IS NULL
      ORDER BY n."createdAt" DESC LIMIT 1),
    'serverTime', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
$$;

CREATE OR REPLACE FUNCTION app.broadcast_project_activity_event()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  BEGIN
    PERFORM realtime.send(
      jsonb_build_object(
        'eventId', NEW.id,
        'projectId', NEW."projectId",
        'version', to_char(NEW.version AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'serverTime', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'actorUserId', NEW."actorUserId",
        'domain', NEW.domain,
        'action', NEW.action,
        'entityId', NEW."entityId",
        'payload', NEW.payload
      ), 'project-activity', 'project:' || NEW."projectId" || ':activity', true
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'project activity Broadcast failed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

-- Snapshot construction bypasses table RLS for a caller-supplied user id.
-- Only the definer-owned trigger functions may invoke it.
REVOKE ALL ON FUNCTION app.build_notification_realtime_snapshot(TEXT) FROM PUBLIC;

CREATE OR REPLACE FUNCTION app.broadcast_project_activity_signal()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public."ProjectActivityEvent" e
    WHERE e."projectId" = NEW.id AND e.version = NEW."updatedAt"
  ) THEN
    RETURN NEW;
  END IF;
  BEGIN
    PERFORM realtime.send(
      jsonb_build_object(
        'eventId', NULL, 'projectId', NEW.id,
        'version', to_char(NEW."updatedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'serverTime', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'actorUserId', NULL, 'domain', NULL, 'action', NULL,
        'entityId', NULL, 'payload', NULL
      ), 'project-activity', 'project:' || NEW.id || ':activity', true
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'project signal Broadcast failed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.broadcast_notification_snapshots()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE recipient_id TEXT;
BEGIN
  FOR recipient_id IN SELECT DISTINCT "recipientUserId" FROM new_notifications LOOP
    BEGIN
      PERFORM realtime.send(
        app.build_notification_realtime_snapshot(recipient_id),
        'notification-snapshot', 'user:' || recipient_id || ':notifications', true
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'notification Broadcast failed: %', SQLERRM;
    END;
  END LOOP;
  RETURN NULL;
END;
$$;

DO $$
BEGIN
  IF to_regclass('realtime.messages') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE 'GRANT USAGE ON SCHEMA app TO authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION app.current_user_id() TO authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION app.can_receive_project_activity_topic(TEXT) TO authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION app.can_receive_user_notifications_topic(TEXT) TO authenticated';

  EXECUTE $policy$CREATE POLICY nd_realtime_project_activity_receive
    ON realtime.messages FOR SELECT TO authenticated
    USING (extension = 'broadcast' AND app.can_receive_project_activity_topic(realtime.topic()))$policy$;
  EXECUTE $policy$CREATE POLICY nd_realtime_user_notifications_receive
    ON realtime.messages FOR SELECT TO authenticated
    USING (extension = 'broadcast' AND app.can_receive_user_notifications_topic(realtime.topic()))$policy$;

  CREATE TRIGGER project_activity_event_realtime_broadcast
    AFTER INSERT ON public."ProjectActivityEvent"
    FOR EACH ROW EXECUTE FUNCTION app.broadcast_project_activity_event();
  CREATE CONSTRAINT TRIGGER project_realtime_activity_signal
    AFTER UPDATE ON public."Project" DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW WHEN (NEW."updatedAt" IS DISTINCT FROM OLD."updatedAt")
    EXECUTE FUNCTION app.broadcast_project_activity_signal();
  CREATE TRIGGER notification_realtime_snapshot_broadcast_insert
    AFTER INSERT ON public."Notification"
    REFERENCING NEW TABLE AS new_notifications
    FOR EACH STATEMENT EXECUTE FUNCTION app.broadcast_notification_snapshots();
  CREATE TRIGGER notification_realtime_snapshot_broadcast_update
    AFTER UPDATE ON public."Notification"
    REFERENCING NEW TABLE AS new_notifications
    FOR EACH STATEMENT EXECUTE FUNCTION app.broadcast_notification_snapshots();
END;
$$;
