"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { requireVerifiedSessionUserIdFromServer } from "@/lib/auth/server-guard";
import { resolveRequestOriginFromHeaders } from "@/lib/http/request-origin";
import { logServerError } from "@/lib/observability/logger";
import { logServerWarning } from "@/lib/observability/logger";
import {
  updateAccountEmail,
  updateAccountPassword,
  updateAccountUsername,
} from "@/lib/services/account-profile-service";
import { issueEmailVerificationForUser } from "@/lib/services/email-verification-service";
import { readSessionTokenFromCookieReader } from "@/lib/services/session-service";

const ACCOUNT_PATH = "/account";
const VERIFY_EMAIL_PATH = "/verify-email";

function readText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function redirectWithError(error: string): never {
  redirect(`${ACCOUNT_PATH}?error=${error}`);
}

function redirectWithStatus(status: string): never {
  redirect(`${ACCOUNT_PATH}?status=${status}`);
}

function redirectVerifyWithError(error: string): never {
  redirect(`${VERIFY_EMAIL_PATH}?error=${error}`);
}

function redirectVerifyWithStatus(status: string): never {
  redirect(`${VERIFY_EMAIL_PATH}?status=${status}`);
}

function mapIssueVerificationError(error: string): string {
  switch (error) {
    case "resend-cooldown":
      return "resend-cooldown";
    case "resend-limit-reached":
      return "resend-limit-reached";
    case "already-verified":
      return "already-verified";
    case "verification-email-send-failed":
    default:
      return "verification-email-send-failed";
  }
}

function revalidateAccountPaths() {
  revalidatePath(ACCOUNT_PATH);
  revalidatePath("/account/settings");
  revalidatePath("/projects");
}

export async function updateAccountUsernameAction(formData: FormData): Promise<void> {
  const actorUserId = await requireVerifiedSessionUserIdFromServer();

  const username = readText(formData, "username");

  let result: Awaited<ReturnType<typeof updateAccountUsername>>;
  try {
    result = await updateAccountUsername({
      actorUserId,
      usernameRaw: username,
    });
  } catch (error) {
    logServerError("updateAccountUsernameAction", error);
    redirectWithError("username-update-failed");
  }

  if (!result.ok) {
    redirectWithError(result.error);
  }

  revalidateAccountPaths();
  if (result.data.discriminatorRegenerated) {
    redirectWithStatus("username-updated-regenerated");
  }

  redirectWithStatus("username-updated");
}

export async function updateAccountPasswordAction(formData: FormData): Promise<void> {
  const actorUserId = await requireVerifiedSessionUserIdFromServer();

  const currentPassword = readText(formData, "currentPassword");
  const newPassword = readText(formData, "newPassword");
  const confirmNewPassword = readText(formData, "confirmNewPassword");
  const cookieStore = cookies();
  const currentSessionToken = readSessionTokenFromCookieReader((name) => {
    return cookieStore.get(name)?.value ?? null;
  });

  let result: Awaited<ReturnType<typeof updateAccountPassword>>;
  try {
    result = await updateAccountPassword({
      actorUserId,
      currentPasswordRaw: currentPassword,
      newPasswordRaw: newPassword,
      newPasswordConfirmationRaw: confirmNewPassword,
      currentSessionToken,
    });
  } catch (error) {
    logServerError("updateAccountPasswordAction", error);
    redirectWithError("password-update-failed");
  }

  if (!result.ok) {
    redirectWithError(result.error);
  }

  revalidateAccountPaths();
  redirectWithStatus("password-updated");
}

export async function updateAccountEmailAction(formData: FormData): Promise<void> {
  const actorUserId = await requireVerifiedSessionUserIdFromServer();
  const email = readText(formData, "email");

  let updateResult: Awaited<ReturnType<typeof updateAccountEmail>>;
  try {
    updateResult = await updateAccountEmail({
      actorUserId,
      emailRaw: email,
    });
  } catch (error) {
    logServerError("updateAccountEmailAction", error);
    redirectWithError("email-update-failed");
  }

  if (!updateResult.ok) {
    redirectWithError(updateResult.error);
  }

  if (!updateResult.data.emailChanged) {
    revalidateAccountPaths();
    redirectWithStatus("email-unchanged");
  }

  let issueResult: Awaited<ReturnType<typeof issueEmailVerificationForUser>>;
  try {
    const requestOrigin = resolveRequestOriginFromHeaders(headers());
    issueResult = await issueEmailVerificationForUser({
      actorUserId,
      requestOrigin,
    });
  } catch (error) {
    logServerError("updateAccountEmailAction.issueEmailVerificationForUser", error);
    redirectVerifyWithError("verification-email-send-failed");
  }

  if (!issueResult.ok) {
    logServerWarning(
      "updateAccountEmailAction.issueEmailVerificationForUser",
      "Could not issue verification email after email update.",
      {
        actorUserId,
        error: issueResult.error,
        status: issueResult.status,
      }
    );
    redirectVerifyWithError(mapIssueVerificationError(issueResult.error));
  }

  revalidateAccountPaths();
  const status =
    issueResult.data.delivery === "sent"
      ? "verification-email-sent"
      : "verification-email-queued";
  redirectVerifyWithStatus(status);
}
