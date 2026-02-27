import { redirect } from "next/navigation";

import { getSessionUserIdFromServer } from "@/lib/auth/session-user";
import { isEmailVerifiedForUser } from "@/lib/services/email-verification-service";

export async function requireSessionUserIdFromServer(): Promise<string> {
  const actorUserId = await getSessionUserIdFromServer();

  if (!actorUserId) {
    redirect("/");
  }

  return actorUserId;
}

export async function requireVerifiedSessionUserIdFromServer(): Promise<string> {
  const actorUserId = await requireSessionUserIdFromServer();
  const emailVerified = await isEmailVerifiedForUser(actorUserId);
  if (!emailVerified) {
    redirect("/verify-email");
  }

  return actorUserId;
}
