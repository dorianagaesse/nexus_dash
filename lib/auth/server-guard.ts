import { redirect } from "next/navigation";

import { getSessionUserIdFromServer } from "@/lib/auth/session-user";

export async function requireSessionUserIdFromServer(): Promise<string> {
  const actorUserId = await getSessionUserIdFromServer();

  if (!actorUserId) {
    redirect("/");
  }

  return actorUserId;
}
