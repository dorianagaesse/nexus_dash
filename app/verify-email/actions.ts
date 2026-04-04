"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSessionUserIdFromServer } from "@/lib/auth/session-user";
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

export async function resendVerificationEmailAction(formData?: FormData): Promise<void> {
  const returnToPath = resolveReturnToPath(formData);
  const actorUserId = await getSessionUserIdFromServer();
  if (!actorUserId) {
    redirect(`${HOME_PATH}&returnTo=${encodeURIComponent(returnToPath)}`);
  }

  let result: Awaited<ReturnType<typeof issueEmailVerificationForUser>>;
  try {
    const requestOrigin = resolveRequestOriginFromHeaders(await headers());
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
