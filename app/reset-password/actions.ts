"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { isProductionEnvironment } from "@/lib/env.server";
import { logServerError, logServerWarning } from "@/lib/observability/logger";
import {
  PASSWORD_RESET_RETRY_COOKIE_NAME,
  PASSWORD_RESET_RETRY_COOKIE_TTL_SECONDS,
  resetPasswordWithToken,
} from "@/lib/services/password-reset-service";

const SIGN_IN_PATH = "/?form=signin";
const RESET_PASSWORD_PATH = "/reset-password";

function readText(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function mapResetError(error: string): string {
  switch (error) {
    case "invalid-token":
      return "invalid-reset-link";
    case "token-expired":
      return "expired-reset-link";
    case "password-too-short":
      return "password-too-short";
    case "password-too-long":
      return "password-too-long";
    case "password-requirements-not-met":
      return "password-requirements-not-met";
    case "password-confirmation-mismatch":
      return "password-confirmation-mismatch";
    default:
      return "reset-failed";
  }
}

function shouldPersistTokenForRetry(error: string): boolean {
  return (
    error === "password-too-short" ||
    error === "password-too-long" ||
    error === "password-requirements-not-met" ||
    error === "password-confirmation-mismatch" ||
    error === "reset-failed"
  );
}

function persistResetTokenForRetry(token: string): void {
  if (!token) {
    return;
  }

  cookies().set(PASSWORD_RESET_RETRY_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProductionEnvironment(),
    path: RESET_PASSWORD_PATH,
    maxAge: PASSWORD_RESET_RETRY_COOKIE_TTL_SECONDS,
  });
}

function clearResetTokenRetryCookie(): void {
  cookies().set(PASSWORD_RESET_RETRY_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isProductionEnvironment(),
    path: RESET_PASSWORD_PATH,
    maxAge: 0,
  });
}

function redirectWithError(error: string): never {
  const query = new URLSearchParams();
  query.set("error", error);
  redirect(`${RESET_PASSWORD_PATH}?${query.toString()}`);
}

export async function resetPasswordAction(formData: FormData): Promise<void> {
  const token =
    readText(formData, "token") ||
    cookies().get(PASSWORD_RESET_RETRY_COOKIE_NAME)?.value ||
    "";
  const password = readText(formData, "password");
  const confirmPassword = readText(formData, "confirmPassword");

  let result: Awaited<ReturnType<typeof resetPasswordWithToken>>;
  try {
    result = await resetPasswordWithToken({
      rawToken: token,
      newPasswordRaw: password,
      newPasswordConfirmationRaw: confirmPassword,
    });
  } catch (error) {
    logServerError("resetPasswordAction", error);
    if (token) {
      persistResetTokenForRetry(token);
    }
    redirectWithError("reset-failed");
  }

  if (!result.ok) {
    const mappedError = mapResetError(result.error);
    if (token && shouldPersistTokenForRetry(mappedError)) {
      persistResetTokenForRetry(token);
    } else {
      clearResetTokenRetryCookie();
    }
    logServerWarning(
      "resetPasswordAction.resetPasswordWithToken",
      "Password reset request failed.",
      {
        error: result.error,
        status: result.status,
      }
    );
    redirectWithError(mappedError);
  }

  clearResetTokenRetryCookie();
  redirect(`${SIGN_IN_PATH}&status=password-reset-success`);
}
