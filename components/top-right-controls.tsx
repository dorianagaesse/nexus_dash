import { AccountMenu } from "@/components/account-menu";
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
      <AccountMenu
        isAuthenticated={Boolean(actorUserId)}
        usernameTag={accountIdentity?.usernameTag ?? null}
      />
      <ThemeToggle />
    </div>
  );
}
