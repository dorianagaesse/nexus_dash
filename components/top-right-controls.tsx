import { unstable_noStore as noStore } from "next/cache";

import { AccountMenu } from "@/components/account-menu";
import { AppMetadataPill } from "@/components/app-metadata-pill";
import { ThemeToggle } from "@/components/theme-toggle";
import { getSessionUserIdFromServer } from "@/lib/auth/session-user";
import { logServerError } from "@/lib/observability/logger";
import { getAccountIdentitySummary } from "@/lib/services/account-identity-service";
import { countPendingProjectInvitationsForUser } from "@/lib/services/project-collaboration-service";

export async function TopRightControls() {
  noStore();
  const actorUserId = await getSessionUserIdFromServer();
  let accountIdentity = null;
  let pendingInvitationCount = 0;

  if (actorUserId) {
    const [accountIdentityResult, pendingInvitationCountResult] =
      await Promise.allSettled([
        getAccountIdentitySummary(actorUserId),
        countPendingProjectInvitationsForUser(actorUserId),
      ]);

    if (accountIdentityResult.status === "fulfilled") {
      accountIdentity = accountIdentityResult.value;
    } else {
      logServerError(
        "TopRightControls.getAccountIdentitySummary",
        accountIdentityResult.reason
      );
    }

    if (pendingInvitationCountResult.status === "fulfilled") {
      pendingInvitationCount = pendingInvitationCountResult.value;
    } else {
      logServerError(
        "TopRightControls.countPendingProjectInvitationsForUser",
        pendingInvitationCountResult.reason
      );
    }
  }

  return (
    <div className="fixed right-4 top-4 z-40 flex items-center gap-2">
      <AppMetadataPill />
      <AccountMenu
        isAuthenticated={Boolean(actorUserId)}
        displayName={accountIdentity?.displayName ?? null}
        usernameTag={accountIdentity?.usernameTag ?? null}
        avatarSeed={accountIdentity?.avatarSeed ?? null}
        pendingInvitationCount={pendingInvitationCount}
      />
      <ThemeToggle />
    </div>
  );
}
