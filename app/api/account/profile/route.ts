import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedApiUser } from "@/lib/auth/api-guard";
import { resolveRequestOriginFromHeaders } from "@/lib/http/request-origin";
import { logServerWarning } from "@/lib/observability/logger";
import {
  getAccountProfile,
  updateAccountEmail,
  updateAccountUsername,
} from "@/lib/services/account-profile-service";
import { issueEmailVerificationForUser } from "@/lib/services/email-verification-service";

interface UpdateAccountProfileRequestBody {
  username?: unknown;
  email?: unknown;
}

function jsonServiceError(result: { status: number; error: string }) {
  return NextResponse.json({ error: result.error }, { status: result.status });
}

function hasPayloadKey(
  payload: UpdateAccountProfileRequestBody,
  key: keyof UpdateAccountProfileRequestBody
) {
  return Object.prototype.hasOwnProperty.call(payload, key);
}

export async function GET(request: NextRequest) {
  const authenticatedUser = await requireAuthenticatedApiUser(request);
  if (!authenticatedUser.ok) {
    return authenticatedUser.response;
  }

  const result = await getAccountProfile(authenticatedUser.userId);
  if (!result.ok) {
    return jsonServiceError(result);
  }

  return NextResponse.json({ profile: result.data }, { status: result.status });
}

export async function PATCH(request: NextRequest) {
  const authenticatedUser = await requireAuthenticatedApiUser(request);
  if (!authenticatedUser.ok) {
    return authenticatedUser.response;
  }

  let payload: UpdateAccountProfileRequestBody;
  try {
    payload = (await request.json()) as UpdateAccountProfileRequestBody;
  } catch (error) {
    logServerWarning("PATCH /api/account/profile.invalidJson", "Invalid JSON payload", {
      error,
    });
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  const shouldUpdateUsername = hasPayloadKey(payload, "username");
  const shouldUpdateEmail = hasPayloadKey(payload, "email");
  if (!shouldUpdateUsername && !shouldUpdateEmail) {
    return NextResponse.json({ error: "invalid-payload" }, { status: 400 });
  }

  const response: Record<string, unknown> = {};

  if (shouldUpdateUsername) {
    const usernameResult = await updateAccountUsername({
      actorUserId: authenticatedUser.userId,
      usernameRaw: typeof payload.username === "string" ? payload.username : "",
    });
    if (!usernameResult.ok) {
      return jsonServiceError(usernameResult);
    }
    response.username = usernameResult.data;
  }

  if (shouldUpdateEmail) {
    const emailResult = await updateAccountEmail({
      actorUserId: authenticatedUser.userId,
      emailRaw: typeof payload.email === "string" ? payload.email : "",
    });
    if (!emailResult.ok) {
      return jsonServiceError(emailResult);
    }

    response.email = emailResult.data;

    if (emailResult.data.emailChanged) {
      const verificationResult = await issueEmailVerificationForUser({
        actorUserId: authenticatedUser.userId,
        requestOrigin: resolveRequestOriginFromHeaders(request.headers),
      });
      if (!verificationResult.ok) {
        return jsonServiceError(verificationResult);
      }

      response.emailVerification = verificationResult.data;
    }
  }

  return NextResponse.json(response);
}
