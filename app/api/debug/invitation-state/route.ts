import { NextRequest, NextResponse } from "next/server";

import { getSessionUserIdFromRequest } from "@/lib/auth/session-user";
import { getOptionalServerEnv, getVercelEnvironment, isLiveProductionDeployment } from "@/lib/env.server";
import { getAccountIdentitySummary } from "@/lib/services/account-identity-service";
import { getAccountProfile } from "@/lib/services/account-profile-service";
import {
  listPendingProjectInvitationsForUser,
  countPendingProjectInvitationsForUser,
} from "@/lib/services/project-collaboration-service";
import { SESSION_COOKIE_NAMES } from "@/lib/services/session-service";

function maskDatabaseHost(): string | null {
  const databaseUrl = getOptionalServerEnv("DATABASE_URL");
  if (!databaseUrl) {
    return null;
  }

  try {
    const host = new URL(databaseUrl).hostname;
    if (host.length <= 12) {
      return host;
    }

    return `${host.slice(0, 6)}...${host.slice(-6)}`;
  } catch {
    return "invalid";
  }
}

export async function GET(request: NextRequest) {
  if (isLiveProductionDeployment()) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }

  const actorUserId = await getSessionUserIdFromRequest(request);
  const presentCookieNames = SESSION_COOKIE_NAMES.filter((cookieName) => {
    return Boolean(request.cookies.get(cookieName)?.value);
  });

  if (!actorUserId) {
    return NextResponse.json(
      {
        environment: {
          vercelEnv: getVercelEnvironment(),
          databaseHost: maskDatabaseHost(),
        },
        authenticated: false,
        presentCookieNames,
      },
      { status: 401 }
    );
  }

  const [accountIdentity, accountProfile, pendingInvitationCount, pendingInvitationsResult] =
    await Promise.all([
      getAccountIdentitySummary(actorUserId),
      getAccountProfile(actorUserId),
      countPendingProjectInvitationsForUser(actorUserId),
      listPendingProjectInvitationsForUser(actorUserId),
    ]);

  return NextResponse.json({
    environment: {
      vercelEnv: getVercelEnvironment(),
      databaseHost: maskDatabaseHost(),
    },
    authenticated: true,
    presentCookieNames,
    actor: {
      userId: actorUserId,
      identity: accountIdentity,
      profile: accountProfile,
    },
    pendingInvitationCount,
    pendingInvitationsResult,
  });
}
