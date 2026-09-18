import { unstable_noStore as noStore } from "next/cache";

import { AuthenticatedAppShellClient } from "@/components/authenticated-app-shell-client";
import { NotificationAwarenessBanner } from "@/components/notification-awareness-banner";
import { getAppMetadataSummary } from "@/lib/app-metadata";
import { requireVerifiedSessionUserIdFromServer } from "@/lib/auth/server-guard";
import { getInitialNotificationRealtimeSnapshotForUser } from "@/lib/notification-realtime-server";
import { getAccountIdentitySummary } from "@/lib/services/account-identity-service";
import type { NotificationRealtimeSnapshot } from "@/lib/notification-realtime-types";

interface AuthenticatedAppShellIdentity {
  displayName: string;
  usernameTag: string | null;
  avatarSeed: string;
}

export async function AuthenticatedAppShell({
  children,
  initialIdentity,
  initialNotificationSnapshot,
}: {
  children: React.ReactNode;
  initialIdentity?: AuthenticatedAppShellIdentity | null;
  initialNotificationSnapshot?: NotificationRealtimeSnapshot;
}) {
  noStore();
  let identity = initialIdentity;
  let notificationSnapshot = initialNotificationSnapshot;

  if (identity === undefined || notificationSnapshot === undefined) {
    const actorUserId = await requireVerifiedSessionUserIdFromServer();
    [identity, notificationSnapshot] = await Promise.all([
      identity === undefined
        ? getAccountIdentitySummary(actorUserId)
        : Promise.resolve(identity),
      notificationSnapshot === undefined
        ? getInitialNotificationRealtimeSnapshotForUser(actorUserId)
        : Promise.resolve(notificationSnapshot),
    ]);
  }

  const appMetadata = getAppMetadataSummary();

  return (
    <AuthenticatedAppShellClient
      displayName={identity?.displayName ?? null}
      usernameTag={identity?.usernameTag ?? null}
      avatarSeed={identity?.avatarSeed ?? null}
      initialNotificationSnapshot={notificationSnapshot}
      appVersionLabel={appMetadata.versionLabel}
      appEnvironment={appMetadata.environment}
      appDiagnosticLabel={appMetadata.diagnosticLabel}
      notificationBanner={
        <NotificationAwarenessBanner initialSnapshot={notificationSnapshot} />
      }
    >
      {children}
    </AuthenticatedAppShellClient>
  );
}
