"use client";

import { AutoDismissingAlert } from "@/components/auto-dismissing-alert";
import { useNotificationRealtimeSnapshot } from "@/lib/notification-realtime-client";
import type { NotificationRealtimeSnapshot } from "@/lib/notification-realtime-types";

interface NotificationAwarenessBannerProps {
  initialSnapshot: NotificationRealtimeSnapshot;
}

export function NotificationAwarenessBanner({
  initialSnapshot,
}: NotificationAwarenessBannerProps) {
  const snapshot = useNotificationRealtimeSnapshot(initialSnapshot);
  const latestNotification = snapshot.latestUnreadNotification;

  if (!latestNotification || snapshot.unreadCount === 0) {
    return null;
  }

  return (
    <AutoDismissingAlert
      key={`${snapshot.version}:${latestNotification.title}`}
      message={
        <>
          {latestNotification.title}{" "}
          <a
            href="/account/notifications"
            className="font-medium underline underline-offset-4"
          >
            Review notifications
          </a>
        </>
      }
      className="rounded-md border border-sky-500/40 bg-sky-500/10 px-4 py-3 text-sm text-sky-700 dark:text-sky-200"
    />
  );
}
