import { unstable_noStore as noStore } from "next/cache";

import { AuthenticatedAppShellClient } from "@/components/authenticated-app-shell-client";
import { NotificationAwarenessBanner } from "@/components/notification-awareness-banner";
import { requireVerifiedSessionUserIdFromServer } from "@/lib/auth/server-guard";
import { getAppMetadataSummary } from "@/lib/app-metadata";
import { getInitialNotificationRealtimeSnapshotForUser } from "@/lib/notification-realtime-server";
import { getAccountIdentitySummary } from "@/lib/services/account-identity-service";

export async function AuthenticatedAppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  noStore();
  const actorUserId = await requireVerifiedSessionUserIdFromServer();
  const [identity, notificationSnapshot] = await Promise.all([
    getAccountIdentitySummary(actorUserId),
    getInitialNotificationRealtimeSnapshotForUser(actorUserId),
  ]);

  return (
    <AuthenticatedAppShellClient
      displayName={identity?.displayName ?? null}
      usernameTag={identity?.usernameTag ?? null}
      avatarSeed={identity?.avatarSeed ?? null}
      initialNotificationSnapshot={notificationSnapshot}
      appMetadata={getAppMetadataSummary()}
      notificationBanner={
        <NotificationAwarenessBanner initialSnapshot={notificationSnapshot} />
      }
    >
      {children}
    </AuthenticatedAppShellClient>
  );
}
