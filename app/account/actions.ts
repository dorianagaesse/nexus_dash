"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { requireVerifiedSessionUserIdFromServer } from "@/lib/auth/server-guard";
import { logServerError } from "@/lib/observability/logger";
import { updateAccountPassword, updateAccountUsername } from "@/lib/services/account-profile-service";
import { readSessionTokenFromCookieReader } from "@/lib/services/session-service";

const ACCOUNT_PATH = "/account";

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

function revalidateAccountPaths() {
  revalidatePath(ACCOUNT_PATH);
  revalidatePath("/account/settings");
  revalidatePath("/projects");
}

export async function updateAccountUsernameAction(formData: FormData): Promise<void> {
  const actorUserId = await requireVerifiedSessionUserIdFromServer();

  const username = readText(formData, "username");

  try {
    const result = await updateAccountUsername({
      actorUserId,
      usernameRaw: username,
    });

    if (!result.ok) {
      redirectWithError(result.error);
    }

    revalidateAccountPaths();
    if (result.data.discriminatorRegenerated) {
      redirectWithStatus("username-updated-regenerated");
    }
  } catch (error) {
    logServerError("updateAccountUsernameAction", error);
    redirectWithError("username-update-failed");
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

  try {
    const result = await updateAccountPassword({
      actorUserId,
      currentPasswordRaw: currentPassword,
      newPasswordRaw: newPassword,
      newPasswordConfirmationRaw: confirmNewPassword,
      currentSessionToken,
    });

    if (!result.ok) {
      redirectWithError(result.error);
    }
  } catch (error) {
    logServerError("updateAccountPasswordAction", error);
    redirectWithError("password-update-failed");
  }

  revalidateAccountPaths();
  redirectWithStatus("password-updated");
}
