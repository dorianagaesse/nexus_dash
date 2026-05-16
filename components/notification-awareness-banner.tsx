import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";

import { AutoDismissingAlert } from "@/components/auto-dismissing-alert";
import { logServerError } from "@/lib/observability/logger";
import { getLatestUnreadNotificationForUser } from "@/lib/services/notification-service";

interface NotificationAwarenessBannerProps {
  actorUserId: string;
}

export async function NotificationAwarenessBanner({
  actorUserId,
}: NotificationAwarenessBannerProps) {
  noStore();
  const result = await (async () => {
    try {
      return await getLatestUnreadNotificationForUser(actorUserId);
    } catch (error) {
      logServerError(
        "NotificationAwarenessBanner.getLatestUnreadNotificationForUser",
        error
      );
      return null;
    }
  })();

  if (!result?.ok) {
    return null;
  }

  if (!result.data.notification) {
    return null;
  }

  const latestNotification = result.data.notification;

  return (
    <AutoDismissingAlert
      message={
        <>
          {latestNotification.title}{" "}
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
