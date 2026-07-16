"use client";

import Link from "next/link";

import { AutoDismissingAlert } from "@/components/auto-dismissing-alert";
import { useNotificationRealtimeSnapshot } from "@/lib/notification-realtime-client";
import type { NotificationRealtimeSnapshot } from "@/lib/notification-realtime-types";
import { useCurrentAppPath } from "@/lib/hooks/use-current-app-path";
import { buildAuthenticatedDestinationHref } from "@/lib/navigation/authenticated-shell";

interface NotificationAwarenessBannerProps {
  initialSnapshot: NotificationRealtimeSnapshot;
}

export function NotificationAwarenessBanner({
  initialSnapshot,
}: NotificationAwarenessBannerProps) {
  const snapshot = useNotificationRealtimeSnapshot(initialSnapshot);
  const currentPath = useCurrentAppPath();
  const latestNotification = snapshot.latestUnreadNotification;

  if (
    currentPath.startsWith("/account/notifications") ||
    !latestNotification ||
    snapshot.unreadCount === 0
  ) {
    return null;
  }

  return (
    <AutoDismissingAlert
      key={`${snapshot.version}:${latestNotification.title}`}
      message={
        <>
          {latestNotification.title}{" "}
          <Link
            href={buildAuthenticatedDestinationHref(
              "/account/notifications",
              currentPath
            )}
            className="font-medium underline underline-offset-4"
          >
            Review notifications
          </Link>
        </>
      }
      className="rounded-md border border-sky-500/40 bg-sky-500/10 px-4 py-3 text-sm text-sky-700 dark:text-sky-200"
    />
  );
}
