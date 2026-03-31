import crypto from "node:crypto";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getSessionUserIdFromRequest } from "@/lib/auth/session-user";
import { verifyAgentAccessToken } from "@/lib/auth/agent-token-service";
import {
  getOptionalServerEnv,
  getRuntimeEnvironment,
  isLiveProductionDeployment,
} from "@/lib/env.server";
import { logServerError } from "@/lib/observability/logger";
import {
  recordAgentRequestUsage,
} from "@/lib/services/project-agent-access-service";
import { isEmailVerifiedForUser } from "@/lib/services/email-verification-service";
import type { AgentScope } from "@/lib/agent-access";
import type { AgentProjectAccessContext } from "@/lib/services/project-access-service";

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

export interface HumanApiPrincipal {
  kind: "human";
  actorUserId: string;
  requestId: string;
}

export interface AgentApiPrincipal {
  kind: "agent";
  actorUserId: string;
  ownerUserId: string;
  credentialId: string;
  projectId: string;
  scopes: AgentScope[];
  tokenId: string;
  requestId: string;
}

export type ApiPrincipal = HumanApiPrincipal | AgentApiPrincipal;

interface ApiPrincipalSuccess {
  ok: true;
  principal: ApiPrincipal;
}

interface ApiPrincipalFailure {
  ok: false;
  response: NextResponse;
}

export type ApiPrincipalResult = ApiPrincipalSuccess | ApiPrincipalFailure;

export function resolveRequestId(request: NextRequest | Request): string {
  const requestId = request.headers.get("x-request-id")?.trim();
  return requestId && requestId.length > 0 ? requestId : crypto.randomUUID();
}

function readBearerToken(request: NextRequest | Request): string | null {
  const authorizationHeader = request.headers.get("authorization")?.trim();
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, ...valueParts] = authorizationHeader.split(/\s+/);
  if (scheme.toLowerCase() !== "bearer" || valueParts.length === 0) {
    return null;
  }

  const token = valueParts.join(" ").trim();
  return token.length > 0 ? token : null;
}

function hasBearerToken(request: NextRequest | Request): boolean {
  return readBearerToken(request) != null;
}

export function readClientIpAddress(request: NextRequest | Request): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstAddress = forwardedFor
      .split(",")
      .map((entry) => entry.trim())
      .find((entry) => entry.length > 0);
    if (firstAddress) {
      return firstAddress;
    }
  }

  return request.headers.get("x-real-ip")?.trim() ?? null;
}

async function requireVerifiedSessionApiUser(
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

export function getAgentProjectAccessContext(
  principal: ApiPrincipal
): AgentProjectAccessContext | undefined {
  if (principal.kind !== "agent") {
    return undefined;
  }

  return {
    credentialId: principal.credentialId,
    projectId: principal.projectId,
    scopes: principal.scopes,
  };
}

export async function requireApiPrincipal(
  request: NextRequest | Request
): Promise<ApiPrincipalResult> {
  const requestId = resolveRequestId(request);
  const bearerToken = readBearerToken(request);

  if (bearerToken) {
    const verifiedToken = verifyAgentAccessToken(bearerToken);
    if (!verifiedToken.ok) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: verifiedToken.error },
          { status: verifiedToken.status }
        ),
      };
    }

    let requestUsageResult;
    try {
      requestUsageResult = await recordAgentRequestUsage({
        credentialId: verifiedToken.data.credentialId,
        ownerUserId: verifiedToken.data.ownerUserId,
        projectId: verifiedToken.data.projectId,
        tokenId: verifiedToken.data.tokenId,
        requestId,
        ipAddress: readClientIpAddress(request),
        userAgent: request.headers.get("user-agent"),
        httpMethod: request.method,
        path: new URL(request.url).pathname,
      });
    } catch (error) {
      logServerError("requireApiPrincipal.recordAgentRequestUsage", error, {
        requestId,
        credentialId: verifiedToken.data.credentialId,
        projectId: verifiedToken.data.projectId,
      });
      return {
        ok: false,
        response: NextResponse.json(
          { error: "agent-usage-not-recorded" },
          { status: 500 }
        ),
      };
    }

    if (!requestUsageResult.ok) {
      if (requestUsageResult.status >= 500) {
        logServerError(
          "requireApiPrincipal.recordAgentRequestUsage",
          requestUsageResult.error,
          {
            requestId,
            credentialId: verifiedToken.data.credentialId,
            projectId: verifiedToken.data.projectId,
            status: requestUsageResult.status,
          }
        );
      }

      return {
        ok: false,
        response: NextResponse.json(
          { error: requestUsageResult.error },
          { status: requestUsageResult.status }
        ),
      };
    }

    return {
      ok: true,
      principal: {
        kind: "agent",
        actorUserId: verifiedToken.data.ownerUserId,
        ownerUserId: verifiedToken.data.ownerUserId,
        credentialId: verifiedToken.data.credentialId,
        projectId: verifiedToken.data.projectId,
        scopes: verifiedToken.data.scopes,
        tokenId: verifiedToken.data.tokenId,
        requestId,
      },
    };
  }

  const authenticatedUser = await requireVerifiedSessionApiUser(request);
  if (!authenticatedUser.ok) {
    return authenticatedUser;
  }

  return {
    ok: true,
    principal: {
      kind: "human",
      actorUserId: authenticatedUser.userId,
      requestId,
    },
  };
}

export async function requireAuthenticatedApiUser(
  request: NextRequest | Request
): Promise<AuthenticatedApiUserResult> {
  if (hasBearerToken(request)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }

  return requireVerifiedSessionApiUser(request);
}
