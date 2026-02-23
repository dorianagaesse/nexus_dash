"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSessionUserIdFromServer } from "@/lib/auth/session-user";
import { logServerError } from "@/lib/observability/logger";
import { updateGoogleCalendarTargetSettings } from "@/lib/services/account-settings-service";

const SETTINGS_PATH = "/account/settings";

function readText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function redirectWithError(error: string): never {
  redirect(`${SETTINGS_PATH}?error=${error}`);
}

function redirectWithStatus(status: string): never {
  redirect(`${SETTINGS_PATH}?status=${status}`);
}

export async function updateGoogleCalendarSettingsAction(
  formData: FormData
): Promise<void> {
  const actorUserId = await getSessionUserIdFromServer();
  if (!actorUserId) {
    redirectWithError("unauthorized");
  }

  const intent = readText(formData, "intent");
  const calendarIdRaw = intent === "reset" ? "" : readText(formData, "calendarId");

  try {
    const result = await updateGoogleCalendarTargetSettings({
      actorUserId,
      calendarIdRaw,
    });

    if (!result.ok) {
      redirectWithError(result.error);
    }
  } catch (error) {
    logServerError("updateGoogleCalendarSettingsAction", error);
    redirectWithError("update-failed");
  }

  revalidatePath(SETTINGS_PATH);
  redirectWithStatus(intent === "reset" ? "calendar-reset" : "calendar-updated");
}
