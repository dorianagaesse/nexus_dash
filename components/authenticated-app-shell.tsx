import { unstable_noStore as noStore } from "next/cache";

import { AuthenticatedAppShellClient } from "@/components/authenticated-app-shell-client";
import { NotificationAwarenessBanner } from "@/components/notification-awareness-banner";
import { requireVerifiedSessionUserIdFromServer } from "@/lib/auth/server-guard";
import { getInitialNotificationRealtimeSnapshotForUser } from "@/lib/notification-realtime-server";
import { getAccountIdentitySummary } from "@/lib/services/account-identity-service";
import {
  getWorkspaceMeetingTodoNavigationSummary,
  type WorkspaceMeetingTodoNavigationSummary,
} from "@/lib/services/workspace-meeting-todo-service";
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
  initialMeetingTodoSummary,
}: {
  children: React.ReactNode;
  initialIdentity?: AuthenticatedAppShellIdentity | null;
  initialNotificationSnapshot?: NotificationRealtimeSnapshot;
  initialMeetingTodoSummary?: WorkspaceMeetingTodoNavigationSummary;
}) {
  noStore();
  let identity = initialIdentity;
  let notificationSnapshot = initialNotificationSnapshot;
  let meetingTodoSummary = initialMeetingTodoSummary;

  if (
    identity === undefined ||
    notificationSnapshot === undefined ||
    meetingTodoSummary === undefined
  ) {
    const actorUserId = await requireVerifiedSessionUserIdFromServer();
    [identity, notificationSnapshot, meetingTodoSummary] = await Promise.all([
      identity === undefined
        ? getAccountIdentitySummary(actorUserId)
        : Promise.resolve(identity),
      notificationSnapshot === undefined
        ? getInitialNotificationRealtimeSnapshotForUser(actorUserId)
        : Promise.resolve(notificationSnapshot),
      meetingTodoSummary === undefined
        ? getWorkspaceMeetingTodoNavigationSummary(actorUserId)
        : Promise.resolve(meetingTodoSummary),
    ]);
  }

  return (
    <AuthenticatedAppShellClient
      displayName={identity?.displayName ?? null}
      usernameTag={identity?.usernameTag ?? null}
      avatarSeed={identity?.avatarSeed ?? null}
      initialNotificationSnapshot={notificationSnapshot}
      initialMeetingTodoSummary={meetingTodoSummary}
      notificationBanner={
        <NotificationAwarenessBanner initialSnapshot={notificationSnapshot} />
      }
    >
      {children}
    </AuthenticatedAppShellClient>
  );
}
