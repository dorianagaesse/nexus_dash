"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSessionUserIdFromServer } from "@/lib/auth/session-user";
import {
  AuthRateLimitScope,
  buildAuthRateLimitKey,
  buildCompositeAuthRateLimitKey,
  consumeAuthAbuseQuota,
  type AuthAbuseSignal,
} from "@/lib/services/auth-abuse-control-service";
import {
  readClientIpAddressFromHeaders,
  readUserAgentFromHeaders,
  resolveRequestIdFromHeaders,
} from "@/lib/http/request-metadata";
import { resolveRequestOriginFromHeaders } from "@/lib/http/request-origin";
import { appendQueryToPath, normalizeReturnToPath } from "@/lib/navigation/return-to";
import { logServerError, logServerWarning } from "@/lib/observability/logger";
import {
  getEmailVerificationStatus,
  issueEmailVerificationForUser,
} from "@/lib/services/email-verification-service";

const HOME_PATH = "/?form=signin";
const VERIFY_EMAIL_PATH = "/verify-email";
const PROJECTS_PATH = "/projects";
const VERIFICATION_RESEND_WINDOW_MS = 15 * 60 * 1000;
const VERIFICATION_RESEND_BLOCK_MS = 15 * 60 * 1000;

function redirectWithError(error: string): never {
  redirect(`${VERIFY_EMAIL_PATH}?error=${error}`);
}

function redirectWithStatus(status: string): never {
  redirect(`${VERIFY_EMAIL_PATH}?status=${status}`);
}

function resolveReturnToPath(formData?: FormData): string {
  if (!formData) {
    return normalizeReturnToPath(null, PROJECTS_PATH);
  }

  const value = formData.get("returnTo");
  return normalizeReturnToPath(typeof value === "string" ? value : null, PROJECTS_PATH);
}

function mapIssueError(error: string): string {
  switch (error) {
    case "too-many-attempts":
      return "resend-throttled";
    case "resend-cooldown":
      return "resend-cooldown";
    case "resend-limit-reached":
      return "resend-limit-reached";
    case "verification-email-send-failed":
      return "verification-email-send-failed";
    case "already-verified":
      return "already-verified";
    default:
      return "verification-email-send-failed";
  }
}

function buildVerificationResendSignals(input: {
  actorUserId: string;
  ipAddress: string | null;
}): AuthAbuseSignal[] {
  const signals: AuthAbuseSignal[] = [];
  const ipKey = buildAuthRateLimitKey("verification-resend:ip", input.ipAddress);
  const userKey = buildAuthRateLimitKey("verification-resend:user", input.actorUserId);
  const ipUserKey = buildCompositeAuthRateLimitKey("verification-resend:ip-user", [
    input.ipAddress,
    input.actorUserId,
  ]);

  if (ipKey) {
    signals.push({
      key: ipKey,
      maxAttempts: 6,
      windowMs: VERIFICATION_RESEND_WINDOW_MS,
      blockMs: VERIFICATION_RESEND_BLOCK_MS,
    });
  }

  if (userKey) {
    signals.push({
      key: userKey,
      maxAttempts: 4,
      windowMs: VERIFICATION_RESEND_WINDOW_MS,
      blockMs: VERIFICATION_RESEND_BLOCK_MS,
    });
  }

  if (ipUserKey) {
    signals.push({
      key: ipUserKey,
      maxAttempts: 3,
      windowMs: VERIFICATION_RESEND_WINDOW_MS,
      blockMs: VERIFICATION_RESEND_BLOCK_MS,
    });
  }

  return signals;
}

export async function resendVerificationEmailAction(formData?: FormData): Promise<void> {
  const returnToPath = resolveReturnToPath(formData);
  const actorUserId = await getSessionUserIdFromServer();
  if (!actorUserId) {
    redirect(`${HOME_PATH}&returnTo=${encodeURIComponent(returnToPath)}`);
  }

  let result: Awaited<ReturnType<typeof issueEmailVerificationForUser>>;
  const requestHeaders = await headers();
  const requestId = resolveRequestIdFromHeaders(requestHeaders);
  const ipAddress = readClientIpAddressFromHeaders(requestHeaders);
  const userAgent = readUserAgentFromHeaders(requestHeaders);
  const abuseControl = await consumeAuthAbuseQuota({
    scope: AuthRateLimitScope.verification_resend,
    signals: buildVerificationResendSignals({
      actorUserId,
      ipAddress,
    }),
  });
  if (!abuseControl.ok) {
    logServerWarning(
      "resendVerificationEmailAction.throttled",
      "Verification resend throttled.",
      {
        actorUserId,
        requestId,
        ipAddress,
        userAgent,
        retryAfterSeconds: abuseControl.retryAfterSeconds,
      }
    );
    redirect(
      appendQueryToPath(VERIFY_EMAIL_PATH, {
        error: "resend-throttled",
        returnTo: returnToPath,
      })
    );
  }

  try {
    const requestOrigin = resolveRequestOriginFromHeaders(requestHeaders);
    result = await issueEmailVerificationForUser({
      actorUserId,
      requestOrigin,
      returnToPath,
    });
  } catch (error) {
    logServerError("resendVerificationEmailAction", error);
    redirect(
      appendQueryToPath(VERIFY_EMAIL_PATH, {
        error: "verification-email-send-failed",
        returnTo: returnToPath,
      })
    );
  }

  if (!result.ok) {
    if (result.error === "already-verified") {
      redirect(returnToPath);
    }

    logServerWarning(
      "resendVerificationEmailAction.issueEmailVerificationForUser",
      "Could not resend verification email.",
      {
        actorUserId,
        error: result.error,
        status: result.status,
      }
    );
    redirect(
      appendQueryToPath(VERIFY_EMAIL_PATH, {
        error: mapIssueError(result.error),
        returnTo: returnToPath,
      })
    );
  }

  const status = result.data.delivery === "sent" ? "resend-sent" : "resend-queued";
  redirect(
    appendQueryToPath(VERIFY_EMAIL_PATH, {
      status,
      returnTo: returnToPath,
    })
  );
}

export async function continueAfterVerificationAction(formData?: FormData): Promise<void> {
  const returnToPath = resolveReturnToPath(formData);
  const actorUserId = await getSessionUserIdFromServer();
  if (!actorUserId) {
    redirect(`${HOME_PATH}&returnTo=${encodeURIComponent(returnToPath)}`);
  }

  let status: Awaited<ReturnType<typeof getEmailVerificationStatus>>;
  try {
    status = await getEmailVerificationStatus(actorUserId);
  } catch (error) {
    logServerError("continueAfterVerificationAction", error);
    redirectWithError("verification-pending");
  }

  if (!status.ok) {
    redirect(`${HOME_PATH}&returnTo=${encodeURIComponent(returnToPath)}`);
  }

  if (status.data.isVerified) {
    redirect(returnToPath);
  }

  redirect(
    appendQueryToPath(VERIFY_EMAIL_PATH, {
      error: "verification-pending",
      returnTo: returnToPath,
    })
  );
}
