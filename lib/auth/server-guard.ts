import { redirect } from "next/navigation";

import { getSessionUserIdFromServer } from "@/lib/auth/session-user";
import { isLiveProductionDeployment } from "@/lib/env.server";
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
  if (!isLiveProductionDeployment()) {
    return actorUserId;
  }

  const emailVerified = await isEmailVerifiedForUser(actorUserId);
  if (!emailVerified) {
    redirect("/verify-email");
  }

  return actorUserId;
}
