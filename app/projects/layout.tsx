import { NotificationAwarenessBanner } from "@/components/notification-awareness-banner";
import { requireVerifiedSessionUserIdFromServer } from "@/lib/auth/server-guard";
import { logServerError } from "@/lib/observability/logger";
import { getNotificationRealtimeSnapshotForUser } from "@/lib/services/notification-service";
import type { NotificationRealtimeSnapshot } from "@/lib/notification-realtime-types";

export const dynamic = "force-dynamic";

export default async function ProjectsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actorUserId = await requireVerifiedSessionUserIdFromServer();
  let notificationSnapshot: NotificationRealtimeSnapshot = {
    version: new Date(0).toISOString(),
    unreadCount: 0,
    latestUnreadNotification: null,
    serverTime: new Date().toISOString(),
  };

  try {
    const result = await getNotificationRealtimeSnapshotForUser(actorUserId);
    if (result.ok) {
      notificationSnapshot = result.data;
    }
  } catch (error) {
    logServerError("ProjectsLayout.getNotificationRealtimeSnapshotForUser", error);
  }

  return (
    <>
      <div className="container pt-6">
        <NotificationAwarenessBanner initialSnapshot={notificationSnapshot} />
      </div>
      {children}
    </>
  );
}
