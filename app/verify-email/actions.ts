"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSessionUserIdFromServer } from "@/lib/auth/session-user";
import { resolveRequestOriginFromHeaders } from "@/lib/http/request-origin";
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

export async function resendVerificationEmailAction(): Promise<void> {
  const actorUserId = await getSessionUserIdFromServer();
  if (!actorUserId) {
    redirect(HOME_PATH);
  }

  try {
    const requestOrigin = resolveRequestOriginFromHeaders(headers());
    const result = await issueEmailVerificationForUser({
      actorUserId,
      requestOrigin,
    });

    if (!result.ok) {
      if (result.error === "already-verified") {
        redirect(PROJECTS_PATH);
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
      redirectWithError(mapIssueError(result.error));
    }

    const status =
      result.data.delivery === "sent" ? "resend-sent" : "resend-queued";
    redirectWithStatus(status);
  } catch (error) {
    logServerError("resendVerificationEmailAction", error);
    redirectWithError("verification-email-send-failed");
  }
}

export async function continueAfterVerificationAction(): Promise<void> {
  const actorUserId = await getSessionUserIdFromServer();
  if (!actorUserId) {
    redirect(HOME_PATH);
  }

  try {
    const status = await getEmailVerificationStatus(actorUserId);
    if (!status.ok) {
      redirect(HOME_PATH);
    }

    if (status.data.isVerified) {
      redirect(PROJECTS_PATH);
    }
  } catch (error) {
    logServerError("continueAfterVerificationAction", error);
  }

  redirectWithError("verification-pending");
}
