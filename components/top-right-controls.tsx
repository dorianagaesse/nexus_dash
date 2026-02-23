import { AccountMenu } from "@/components/account-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { getSessionUserIdFromServer } from "@/lib/auth/session-user";

export async function TopRightControls() {
  const actorUserId = await getSessionUserIdFromServer();

  return (
    <div className="fixed right-4 top-4 z-40 flex items-center gap-2">
      <AccountMenu isAuthenticated={Boolean(actorUserId)} />
      <ThemeToggle />
    </div>
  );
}
