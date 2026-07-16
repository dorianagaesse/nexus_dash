import { unstable_noStore as noStore } from "next/cache";

import { AppMetadataPill } from "@/components/app-metadata-pill";
import { ThemeToggle } from "@/components/theme-toggle";
import { getSessionUserIdFromServer } from "@/lib/auth/session-user";

export async function TopRightControls() {
  noStore();
  const actorUserId = await getSessionUserIdFromServer();

  if (actorUserId) {
    return null;
  }

  return (
    <div className="fixed right-4 top-4 z-[var(--layer-shell)] flex items-center gap-2">
      <AppMetadataPill />
      <ThemeToggle />
    </div>
  );
}
