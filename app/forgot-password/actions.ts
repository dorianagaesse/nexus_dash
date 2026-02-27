"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { resolveRequestOriginFromHeaders } from "@/lib/http/request-origin";
import { logServerError, logServerWarning } from "@/lib/observability/logger";
import { requestPasswordResetForEmail } from "@/lib/services/password-reset-service";

const FORGOT_PASSWORD_PATH = "/forgot-password";

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

export async function requestPasswordResetAction(formData: FormData): Promise<void> {
  const email = readText(formData, "email");

  try {
    const requestOrigin = resolveRequestOriginFromHeaders(headers());
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
