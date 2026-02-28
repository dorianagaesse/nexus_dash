import { AccountMenu } from "@/components/account-menu";
import { AppMetadataPill } from "@/components/app-metadata-pill";
import { ThemeToggle } from "@/components/theme-toggle";
import { getSessionUserIdFromServer } from "@/lib/auth/session-user";
import { getAccountIdentitySummary } from "@/lib/services/account-identity-service";

export async function TopRightControls() {
  const actorUserId = await getSessionUserIdFromServer();
  const accountIdentity = actorUserId
    ? await getAccountIdentitySummary(actorUserId)
    : null;

  return (
    <div className="fixed right-4 top-4 z-40 flex items-center gap-2">
      <AppMetadataPill />
      <AccountMenu
        isAuthenticated={Boolean(actorUserId)}
        displayName={accountIdentity?.displayName ?? null}
        usernameTag={accountIdentity?.usernameTag ?? null}
      />
      <ThemeToggle />
    </div>
  );
}
