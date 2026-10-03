import type { NotificationRealtimeSnapshot } from "@/lib/notification-realtime-types";

export const NOTIFICATION_STREAM_EVENT = "notification-snapshot";

export function isSnapshotChanged(
  next: NotificationRealtimeSnapshot,
  previous: NotificationRealtimeSnapshot
): boolean {
  return (
    next.version !== previous.version ||
    next.unreadCount !== previous.unreadCount ||
    next.latestUnreadNotification?.title !==
      previous.latestUnreadNotification?.title
  );
}
