"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSessionUserIdFromServer } from "@/lib/auth/session-user";
import { appendQueryToPath } from "@/lib/navigation/return-to";
import { logServerError } from "@/lib/observability/logger";
import {
  buildProjectInvitationReturnToPath,
  respondToProjectInvitation,
} from "@/lib/services/project-collaboration-service";

function readText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function buildInvitationPath(invitationId: string): string {
  return buildProjectInvitationReturnToPath(invitationId);
}

export async function acceptProjectInvitationFromLinkAction(
  formData: FormData
): Promise<void> {
  const invitationId = readText(formData, "invitationId");
  const invitationPath = buildInvitationPath(invitationId);
  const actorUserId = await getSessionUserIdFromServer();

  if (!actorUserId) {
    redirect(
      `/?form=signin&returnTo=${encodeURIComponent(invitationPath)}`
    );
  }

  let result: Awaited<ReturnType<typeof respondToProjectInvitation>>;
  try {
    result = await respondToProjectInvitation({
      actorUserId,
      invitationId,
      decision: "accept",
    });
  } catch (error) {
    logServerError("acceptProjectInvitationFromLinkAction", error);
    redirect(
      appendQueryToPath(invitationPath, { error: "invitation-accept-failed" })
    );
  }

  if (!result.ok) {
    if (result.error === "email-unverified") {
      redirect(
        `/verify-email?returnTo=${encodeURIComponent(invitationPath)}`
      );
    }

    redirect(appendQueryToPath(invitationPath, { error: result.error }));
  }

  revalidatePath("/account");
  revalidatePath("/projects");
  revalidatePath(`/projects/${result.data.projectId}`);
  redirect(`/projects/${result.data.projectId}?status=invitation-accepted`);
}

export async function declineProjectInvitationFromLinkAction(
  formData: FormData
): Promise<void> {
  const invitationId = readText(formData, "invitationId");
  const invitationPath = buildInvitationPath(invitationId);
  const actorUserId = await getSessionUserIdFromServer();

  if (!actorUserId) {
    redirect(
      `/?form=signin&returnTo=${encodeURIComponent(invitationPath)}`
    );
  }

  let result: Awaited<ReturnType<typeof respondToProjectInvitation>>;
  try {
    result = await respondToProjectInvitation({
      actorUserId,
      invitationId,
      decision: "decline",
    });
  } catch (error) {
    logServerError("declineProjectInvitationFromLinkAction", error);
    redirect(
      appendQueryToPath(invitationPath, { error: "invitation-decline-failed" })
    );
  }

  if (!result.ok) {
    if (result.error === "email-unverified") {
      redirect(
        `/verify-email?returnTo=${encodeURIComponent(invitationPath)}`
      );
    }

    redirect(appendQueryToPath(invitationPath, { error: result.error }));
  }

  revalidatePath("/account");
  revalidatePath("/projects");
  redirect("/account?status=invitation-declined");
}
