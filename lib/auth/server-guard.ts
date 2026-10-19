import { redirect } from "next/navigation";
import { headers } from "next/headers";
import {
  appendQueryToPath,
  normalizeReturnToPath,
  REQUEST_RETURN_TO_HEADER,
} from "@/lib/navigation/return-to";

import { getSessionUserIdFromServer } from "@/lib/auth/session-user";
import { isLiveProductionDeployment } from "@/lib/env.server";
import { isEmailVerifiedForUser } from "@/lib/services/email-verification-service";

export async function requireSessionUserIdFromServer(): Promise<string> {
  const actorUserId = await getSessionUserIdFromServer();

  if (!actorUserId) {
    const returnTo = normalizeReturnToPath(
      (await headers()).get(REQUEST_RETURN_TO_HEADER),
      ""
    );
    redirect(returnTo ? appendQueryToPath("/", { returnTo }) : "/");
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
    const returnTo = normalizeReturnToPath(
      (await headers()).get(REQUEST_RETURN_TO_HEADER),
      ""
    );
    redirect(returnTo ? appendQueryToPath("/verify-email", { returnTo }) : "/verify-email");
  }

  return actorUserId;
}
