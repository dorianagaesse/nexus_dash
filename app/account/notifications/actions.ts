"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireVerifiedSessionUserIdFromServer } from "@/lib/auth/server-guard";
import { logServerError } from "@/lib/observability/logger";
import {
  markAllNotificationsReadForUser,
  setNotificationReadState,
} from "@/lib/services/notification-service";
import { respondToProjectInvitation } from "@/lib/services/project-collaboration-service";

const NOTIFICATIONS_PATH = "/account/notifications";

function readText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function revalidateNotificationPaths(projectId?: string) {
  revalidatePath(NOTIFICATIONS_PATH);
  revalidatePath("/account");
  revalidatePath("/projects");
  if (projectId) {
    revalidatePath(`/projects/${projectId}`);
  }
}

function redirectWithStatus(status: string): never {
  redirect(`${NOTIFICATIONS_PATH}?status=${status}`);
}

function redirectWithError(error: string): never {
  redirect(`${NOTIFICATIONS_PATH}?error=${error}`);
}

export async function markNotificationReadAction(formData: FormData): Promise<void> {
  const actorUserId = await requireVerifiedSessionUserIdFromServer();
  const notificationId = readText(formData, "notificationId");

  let result: Awaited<ReturnType<typeof setNotificationReadState>>;
  try {
    result = await setNotificationReadState({
      actorUserId,
      notificationId,
      read: true,
    });
  } catch (error) {
    logServerError("markNotificationReadAction", error);
    redirectWithError("notification-update-failed");
  }

  if (!result.ok) {
    redirectWithError(result.error);
  }

  revalidateNotificationPaths();
  redirectWithStatus("notification-read");
}

export async function markNotificationUnreadAction(formData: FormData): Promise<void> {
  const actorUserId = await requireVerifiedSessionUserIdFromServer();
  const notificationId = readText(formData, "notificationId");

  let result: Awaited<ReturnType<typeof setNotificationReadState>>;
  try {
    result = await setNotificationReadState({
      actorUserId,
      notificationId,
      read: false,
    });
  } catch (error) {
    logServerError("markNotificationUnreadAction", error);
    redirectWithError("notification-update-failed");
  }

  if (!result.ok) {
    redirectWithError(result.error);
  }

  revalidateNotificationPaths();
  redirectWithStatus("notification-unread");
}

export async function markAllNotificationsReadAction(): Promise<void> {
  const actorUserId = await requireVerifiedSessionUserIdFromServer();

  let result: Awaited<ReturnType<typeof markAllNotificationsReadForUser>>;
  try {
    result = await markAllNotificationsReadForUser(actorUserId);
  } catch (error) {
    logServerError("markAllNotificationsReadAction", error);
    redirectWithError("notification-update-failed");
  }

  if (!result.ok) {
    redirectWithError(result.error);
  }

  revalidateNotificationPaths();
  redirectWithStatus("notifications-read");
}

export async function acceptNotificationInvitationAction(
  formData: FormData
): Promise<void> {
  const actorUserId = await requireVerifiedSessionUserIdFromServer();
  const invitationId = readText(formData, "invitationId");

  let result: Awaited<ReturnType<typeof respondToProjectInvitation>>;
  try {
    result = await respondToProjectInvitation({
      actorUserId,
      invitationId,
      decision: "accept",
    });
  } catch (error) {
    logServerError("acceptNotificationInvitationAction", error);
    redirectWithError("invitation-accept-failed");
  }

  if (!result.ok) {
    redirectWithError(result.error);
  }

  revalidateNotificationPaths(result.data.projectId);
  redirectWithStatus("invitation-accepted");
}

export async function declineNotificationInvitationAction(
  formData: FormData
): Promise<void> {
  const actorUserId = await requireVerifiedSessionUserIdFromServer();
  const invitationId = readText(formData, "invitationId");

  let result: Awaited<ReturnType<typeof respondToProjectInvitation>>;
  try {
    result = await respondToProjectInvitation({
      actorUserId,
      invitationId,
      decision: "decline",
    });
  } catch (error) {
    logServerError("declineNotificationInvitationAction", error);
    redirectWithError("invitation-decline-failed");
  }

  if (!result.ok) {
    redirectWithError(result.error);
  }

  revalidateNotificationPaths();
  redirectWithStatus("invitation-declined");
}
