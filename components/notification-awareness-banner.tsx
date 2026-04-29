import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";

import { AutoDismissingAlert } from "@/components/auto-dismissing-alert";
import { logServerError } from "@/lib/observability/logger";
import { listNotificationsForUser } from "@/lib/services/notification-service";

interface NotificationAwarenessBannerProps {
  actorUserId: string;
}

export async function NotificationAwarenessBanner({
  actorUserId,
}: NotificationAwarenessBannerProps) {
  noStore();
  const result = await (async () => {
    try {
      return await listNotificationsForUser(actorUserId);
    } catch (error) {
      logServerError("NotificationAwarenessBanner.listNotificationsForUser", error);
      return null;
    }
  })();

  if (!result?.ok) {
    return null;
  }

  const unreadNotifications = result.data.notifications.filter(
    (notification) => !notification.readAt
  );
  if (unreadNotifications.length === 0) {
    return null;
  }

  const firstNotification = unreadNotifications[0];
  const extraCount = unreadNotifications.length - 1;
  const message =
    extraCount > 0
      ? `${firstNotification.title} +${extraCount} more unread notification${extraCount === 1 ? "" : "s"}.`
      : firstNotification.title;

  return (
    <AutoDismissingAlert
      message={
        <>
          {message}{" "}
          <Link
            href="/account/notifications"
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
