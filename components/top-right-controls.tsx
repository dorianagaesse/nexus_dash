import { AccountMenu } from "@/components/account-menu";
import { AppMetadataPill } from "@/components/app-metadata-pill";
import { ThemeToggle } from "@/components/theme-toggle";
import { getSessionUserIdFromServer } from "@/lib/auth/session-user";
import { getAccountIdentitySummary } from "@/lib/services/account-identity-service";
import { countPendingProjectInvitationsForUser } from "@/lib/services/project-collaboration-service";

export async function TopRightControls() {
  const actorUserId = await getSessionUserIdFromServer();
  const [accountIdentity, pendingInvitationCount] = actorUserId
    ? await Promise.all([
        getAccountIdentitySummary(actorUserId),
        countPendingProjectInvitationsForUser(actorUserId),
      ])
    : [null, 0];

  return (
    <div className="fixed right-4 top-4 z-40 flex items-center gap-2">
      <AppMetadataPill />
      <AccountMenu
        isAuthenticated={Boolean(actorUserId)}
        displayName={accountIdentity?.displayName ?? null}
        usernameTag={accountIdentity?.usernameTag ?? null}
        pendingInvitationCount={pendingInvitationCount}
      />
      <ThemeToggle />
    </div>
  );
}
