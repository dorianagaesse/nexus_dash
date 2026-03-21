import { NextRequest, NextResponse } from "next/server";

import { getSessionUserIdFromRequest } from "@/lib/auth/session-user";
import { getOptionalServerEnv, getVercelEnvironment, isLiveProductionDeployment } from "@/lib/env.server";
import { logServerError } from "@/lib/observability/logger";
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

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return {
    name: "UnknownError",
    message: String(error),
  };
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

  const [
    accountIdentityResult,
    accountProfileResult,
    pendingInvitationCountResult,
    pendingInvitationsResult,
  ] = await Promise.allSettled([
    getAccountIdentitySummary(actorUserId),
    getAccountProfile(actorUserId),
    countPendingProjectInvitationsForUser(actorUserId),
    listPendingProjectInvitationsForUser(actorUserId),
  ]);

  const diagnostics = {
    accountIdentity:
      accountIdentityResult.status === "fulfilled"
        ? { ok: true, value: accountIdentityResult.value }
        : { ok: false, error: serializeError(accountIdentityResult.reason) },
    accountProfile:
      accountProfileResult.status === "fulfilled"
        ? { ok: true, value: accountProfileResult.value }
        : { ok: false, error: serializeError(accountProfileResult.reason) },
    pendingInvitationCount:
      pendingInvitationCountResult.status === "fulfilled"
        ? { ok: true, value: pendingInvitationCountResult.value }
        : { ok: false, error: serializeError(pendingInvitationCountResult.reason) },
    pendingInvitations:
      pendingInvitationsResult.status === "fulfilled"
        ? { ok: true, value: pendingInvitationsResult.value }
        : { ok: false, error: serializeError(pendingInvitationsResult.reason) },
  };

  for (const [scope, result] of Object.entries(diagnostics)) {
    if (!result.ok) {
      logServerError(`GET /api/debug/invitation-state.${scope}`, result.error);
    }
  }

  return NextResponse.json({
    environment: {
      vercelEnv: getVercelEnvironment(),
      databaseHost: maskDatabaseHost(),
    },
    authenticated: true,
    presentCookieNames,
    actor: {
      userId: actorUserId,
      identity: diagnostics.accountIdentity,
      profile: diagnostics.accountProfile,
    },
    pendingInvitationCount: diagnostics.pendingInvitationCount,
    pendingInvitationsResult: diagnostics.pendingInvitations,
  });
}
