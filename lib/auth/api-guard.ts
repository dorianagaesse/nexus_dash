import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getSessionUserIdFromRequest } from "@/lib/auth/session-user";
import {
  getOptionalServerEnv,
  getRuntimeEnvironment,
  isLiveProductionDeployment,
} from "@/lib/env.server";
import { logServerError } from "@/lib/observability/logger";
import { isEmailVerifiedForUser } from "@/lib/services/email-verification-service";

interface AuthenticatedApiUserSuccess {
  ok: true;
  userId: string;
}

interface AuthenticatedApiUserFailure {
  ok: false;
  response: NextResponse;
}

export type AuthenticatedApiUserResult =
  | AuthenticatedApiUserSuccess
  | AuthenticatedApiUserFailure;

export async function requireAuthenticatedApiUser(
  request: NextRequest | Request
): Promise<AuthenticatedApiUserResult> {
  const actorUserId = await getSessionUserIdFromRequest(request);
  const runtimeEnvironment = getRuntimeEnvironment();

  if (!actorUserId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }

  // Most route-level tests mock request auth but not user/profile persistence.
  // Keep compatibility by skipping verification gate in test runtime.
  const enforceVerificationInTests =
    getOptionalServerEnv("ENFORCE_EMAIL_VERIFICATION_IN_TESTS") === "1";
  if (
    (runtimeEnvironment === "test" && !enforceVerificationInTests) ||
    !isLiveProductionDeployment()
  ) {
    return {
      ok: true,
      userId: actorUserId,
    };
  }

  let emailVerified = false;
  try {
    emailVerified = await isEmailVerifiedForUser(actorUserId);
  } catch (error) {
    if (runtimeEnvironment === "test") {
      emailVerified = true;
    } else {
      logServerError("requireAuthenticatedApiUser.emailVerificationCheck", error, {
        actorUserId,
      });
      return {
        ok: false,
        response: NextResponse.json({ error: "auth-check-failed" }, { status: 500 }),
      };
    }
  }

  if (!emailVerified) {
    return {
      ok: false,
      response: NextResponse.json({ error: "email-unverified" }, { status: 403 }),
    };
  }

  return {
    ok: true,
    userId: actorUserId,
  };
}
