import { unstable_noStore as noStore } from "next/cache";

import { AccountMenu } from "@/components/account-menu";
import { AppMetadataPill } from "@/components/app-metadata-pill";
import { NotificationLiveUpdates } from "@/components/notification-live-updates";
import { ThemeToggle } from "@/components/theme-toggle";
import { getSessionUserIdFromServer } from "@/lib/auth/session-user";
import { logServerError } from "@/lib/observability/logger";
import { getAccountIdentitySummary } from "@/lib/services/account-identity-service";
import { getNotificationRealtimeSnapshotForUser } from "@/lib/services/notification-service";
import type { NotificationRealtimeSnapshot } from "@/lib/notification-realtime-types";

export async function TopRightControls() {
  noStore();
  const actorUserId = await getSessionUserIdFromServer();
  let accountIdentity = null;
  let notificationSnapshot: NotificationRealtimeSnapshot = {
    version: new Date(0).toISOString(),
    unreadCount: 0,
    latestUnreadNotification: null,
    serverTime: new Date().toISOString(),
  };

  if (actorUserId) {
    const [accountIdentityResult, unreadNotificationCountResult] =
      await Promise.allSettled([
        getAccountIdentitySummary(actorUserId),
        getNotificationRealtimeSnapshotForUser(actorUserId),
      ]);

    if (accountIdentityResult.status === "fulfilled") {
      accountIdentity = accountIdentityResult.value;
    } else {
      logServerError(
        "TopRightControls.getAccountIdentitySummary",
        accountIdentityResult.reason
      );
    }

    if (unreadNotificationCountResult.status === "fulfilled") {
      const result = unreadNotificationCountResult.value;
      if (result.ok) {
        notificationSnapshot = result.data;
      } else {
        logServerError(
          "TopRightControls.getNotificationRealtimeSnapshotForUser",
          new Error(result.error)
        );
      }
    } else {
      logServerError(
        "TopRightControls.getNotificationRealtimeSnapshotForUser",
        unreadNotificationCountResult.reason
      );
    }
  }

  return (
    <div className="fixed right-4 top-4 z-40 flex items-center gap-2">
      {actorUserId ? (
        <NotificationLiveUpdates initialSnapshot={notificationSnapshot} />
      ) : null}
      <AppMetadataPill />
      <AccountMenu
        isAuthenticated={Boolean(actorUserId)}
        displayName={accountIdentity?.displayName ?? null}
        usernameTag={accountIdentity?.usernameTag ?? null}
        avatarSeed={accountIdentity?.avatarSeed ?? null}
        initialUnreadNotificationCount={notificationSnapshot.unreadCount}
      />
      <ThemeToggle />
    </div>
  );
}
