import { AuthenticatedAppShell } from "@/components/authenticated-app-shell";
import { UserHubShell } from "@/components/account/user-hub-shell";
import { requireVerifiedSessionUserIdFromServer } from "@/lib/auth/server-guard";
import { getInitialNotificationRealtimeSnapshotForUser } from "@/lib/notification-realtime-server";
import { getAccountIdentitySummary } from "@/lib/services/account-identity-service";

export const dynamic = "force-dynamic";

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actorUserId = await requireVerifiedSessionUserIdFromServer();
  const [identity, notificationSnapshot] = await Promise.all([
    getAccountIdentitySummary(actorUserId),
    getInitialNotificationRealtimeSnapshotForUser(actorUserId),
  ]);

  return (
    <AuthenticatedAppShell
      initialIdentity={identity}
      initialNotificationSnapshot={notificationSnapshot}
    >
      <UserHubShell
        displayName={identity?.displayName ?? "Your account"}
        usernameTag={identity?.usernameTag ?? null}
        avatarSeed={identity?.avatarSeed ?? actorUserId}
        initialNotificationSnapshot={notificationSnapshot}
      >
        {children}
      </UserHubShell>
    </AuthenticatedAppShell>
  );
}
