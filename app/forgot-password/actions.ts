"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  AuthRateLimitScope,
  buildAuthRateLimitKey,
  buildCompositeAuthRateLimitKey,
  consumeAuthAbuseQuota,
  type AuthAbuseSignal,
} from "@/lib/services/auth-abuse-control-service";
import { normalizeEmail } from "@/lib/services/account-security-policy";
import {
  readClientIpAddressFromHeaders,
  readUserAgentFromHeaders,
  resolveRequestIdFromHeaders,
} from "@/lib/http/request-metadata";
import { resolveRequestOriginFromHeaders } from "@/lib/http/request-origin";
import { logServerError, logServerWarning } from "@/lib/observability/logger";
import { requestPasswordResetForEmail } from "@/lib/services/password-reset-service";

const FORGOT_PASSWORD_PATH = "/forgot-password";
const PASSWORD_RESET_WINDOW_MS = 15 * 60 * 1000;
const PASSWORD_RESET_BLOCK_MS = 15 * 60 * 1000;

function readText(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function redirectWithStatus(status: string): never {
  redirect(`${FORGOT_PASSWORD_PATH}?status=${status}`);
}

function buildPasswordResetSignals(input: {
  email: string;
  ipAddress: string | null;
}): AuthAbuseSignal[] {
  const signals: AuthAbuseSignal[] = [];
  const ipKey = buildAuthRateLimitKey("password-reset:ip", input.ipAddress);
  const emailKey = buildAuthRateLimitKey("password-reset:email", input.email);
  const ipEmailKey = buildCompositeAuthRateLimitKey("password-reset:ip-email", [
    input.ipAddress,
    input.email,
  ]);

  if (ipKey) {
    signals.push({
      key: ipKey,
      maxAttempts: 6,
      windowMs: PASSWORD_RESET_WINDOW_MS,
      blockMs: PASSWORD_RESET_BLOCK_MS,
    });
  }

  if (emailKey) {
    signals.push({
      key: emailKey,
      maxAttempts: 5,
      windowMs: PASSWORD_RESET_WINDOW_MS,
      blockMs: PASSWORD_RESET_BLOCK_MS,
    });
  }

  if (ipEmailKey) {
    signals.push({
      key: ipEmailKey,
      maxAttempts: 4,
      windowMs: PASSWORD_RESET_WINDOW_MS,
      blockMs: PASSWORD_RESET_BLOCK_MS,
    });
  }

  return signals;
}

export async function requestPasswordResetAction(formData: FormData): Promise<void> {
  const email = readText(formData, "email");
  const requestHeaders = await headers();
  const requestId = resolveRequestIdFromHeaders(requestHeaders);
  const ipAddress = readClientIpAddressFromHeaders(requestHeaders);
  const userAgent = readUserAgentFromHeaders(requestHeaders);
  const abuseControl = await consumeAuthAbuseQuota({
    scope: AuthRateLimitScope.password_reset,
    signals: buildPasswordResetSignals({
      email: normalizeEmail(email),
      ipAddress,
    }),
  });
  if (!abuseControl.ok) {
    logServerWarning(
      "requestPasswordResetAction.throttled",
      "Password reset request throttled.",
      {
        requestId,
        ipAddress,
        userAgent,
        retryAfterSeconds: abuseControl.retryAfterSeconds,
      }
    );
    redirectWithStatus("request-submitted");
  }

  try {
    const requestOrigin = resolveRequestOriginFromHeaders(requestHeaders);
    const result = await requestPasswordResetForEmail({
      emailRaw: email,
      requestOrigin,
    });

    if (!result.ok) {
      logServerWarning(
        "requestPasswordResetAction.requestPasswordResetForEmail",
        "Password reset request could not be delivered.",
        {
          error: result.error,
          status: result.status,
        }
      );
    }
  } catch (error) {
    logServerError("requestPasswordResetAction", error);
  }

  // Prevent account enumeration by always returning the same user-facing result.
  redirectWithStatus("request-submitted");
}
