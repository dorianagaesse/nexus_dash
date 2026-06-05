import { NotificationAwarenessBanner } from "@/components/notification-awareness-banner";
import { requireVerifiedSessionUserIdFromServer } from "@/lib/auth/server-guard";
import { getInitialNotificationRealtimeSnapshotForUser } from "@/lib/notification-realtime-server";

export const dynamic = "force-dynamic";

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actorUserId = await requireVerifiedSessionUserIdFromServer();
  const notificationSnapshot =
    await getInitialNotificationRealtimeSnapshotForUser(actorUserId);

  return (
    <>
      <div className="container pt-6">
        <NotificationAwarenessBanner initialSnapshot={notificationSnapshot} />
      </div>
      {children}
    </>
  );
}
