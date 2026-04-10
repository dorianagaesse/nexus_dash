"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSessionUserIdFromServer } from "@/lib/auth/session-user";
import { setPrimarySessionCookie } from "@/lib/auth/session-cookie";
import { isLiveProductionDeployment } from "@/lib/env.server";
import {
  readClientIpAddressFromHeaders,
  readUserAgentFromHeaders,
  resolveRequestIdFromHeaders,
} from "@/lib/http/request-metadata";
import { resolveRequestOriginFromHeaders } from "@/lib/http/request-origin";
import { appendQueryToPath, normalizeReturnToPath } from "@/lib/navigation/return-to";
import { logServerError, logServerWarning } from "@/lib/observability/logger";
import {
  signInWithEmailPassword,
  signUpWithEmailPassword,
} from "@/lib/services/credential-auth-service";
import {
  isEmailVerifiedForUser,
  issueEmailVerificationForUser,
} from "@/lib/services/email-verification-service";

const HOME_PATH = "/";
const PROJECTS_PATH = "/projects";
const VERIFY_EMAIL_PATH = "/verify-email";

type HomeAuthForm = "signin" | "signup";

function readText(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function redirectWithError(
  form: HomeAuthForm,
  error: string,
  options?: { email?: string; returnToPath?: string }
): never {
  const query = new URLSearchParams({
    form,
    error,
  });

  if (options?.email) {
    query.set("email", options.email);
  }

  if (options?.returnToPath) {
    query.set("returnTo", options.returnToPath);
  }

  redirect(`${HOME_PATH}?${query.toString()}`);
}

function resolveReturnToPath(formData: FormData): string {
  const value = formData.get("returnTo");
  return normalizeReturnToPath(typeof value === "string" ? value : null, PROJECTS_PATH);
}

async function resolvePostAuthRedirectPath(
  actorUserId: string,
  returnToPath: string
): Promise<string> {
  if (!isLiveProductionDeployment()) {
    return returnToPath;
  }

  const emailVerified = await isEmailVerifiedForUser(actorUserId);
  return emailVerified
    ? returnToPath
    : appendQueryToPath(VERIFY_EMAIL_PATH, { returnTo: returnToPath });
}

export async function signInAction(formData: FormData): Promise<void> {
  const returnToPath = resolveReturnToPath(formData);
  const actorUserId = await getSessionUserIdFromServer();
  if (actorUserId) {
    const redirectPath = await resolvePostAuthRedirectPath(actorUserId, returnToPath);
    redirect(redirectPath);
  }

  const email = readText(formData, "email");
  const password = readText(formData, "password");
  const requestHeaders = await headers();

  let result: Awaited<ReturnType<typeof signInWithEmailPassword>>;
  try {
    result = await signInWithEmailPassword({
      emailRaw: email,
      passwordRaw: password,
      requestId: resolveRequestIdFromHeaders(requestHeaders),
      ipAddress: readClientIpAddressFromHeaders(requestHeaders),
      userAgent: readUserAgentFromHeaders(requestHeaders),
    });
  } catch (error) {
    logServerError("signInAction", error);
    redirectWithError("signin", "auth-unavailable", {
      email,
      returnToPath,
    });
  }

  if (!result.ok) {
    redirectWithError("signin", result.error, {
      email,
      returnToPath,
    });
  }

  await setPrimarySessionCookie(result.data.sessionToken, result.data.expiresAt);
  if (!result.data.emailVerified && isLiveProductionDeployment()) {
    redirect(
      appendQueryToPath(VERIFY_EMAIL_PATH, {
        status: "verification-required",
        returnTo: returnToPath,
      })
    );
  }

  redirect(returnToPath);
}

export async function signUpAction(formData: FormData): Promise<void> {
  const returnToPath = resolveReturnToPath(formData);
  const actorUserId = await getSessionUserIdFromServer();
  if (actorUserId) {
    const redirectPath = await resolvePostAuthRedirectPath(actorUserId, returnToPath);
    redirect(redirectPath);
  }

  const email = readText(formData, "email");
  const username = readText(formData, "username");
  const password = readText(formData, "password");
  const confirmPassword = readText(formData, "confirmPassword");
  const requestHeaders = await headers();

  let result: Awaited<ReturnType<typeof signUpWithEmailPassword>>;
  try {
    result = await signUpWithEmailPassword({
      emailRaw: email,
      usernameRaw: username,
      passwordRaw: password,
      passwordConfirmationRaw: confirmPassword,
      requestId: resolveRequestIdFromHeaders(requestHeaders),
      ipAddress: readClientIpAddressFromHeaders(requestHeaders),
      userAgent: readUserAgentFromHeaders(requestHeaders),
    });
  } catch (error) {
    logServerError("signUpAction", error);
    redirectWithError("signup", "auth-unavailable", {
      email,
      returnToPath,
    });
  }

  if (!result.ok) {
    redirectWithError("signup", result.error, {
      email,
      returnToPath,
    });
  }

  await setPrimarySessionCookie(result.data.sessionToken, result.data.expiresAt);
  if (!isLiveProductionDeployment()) {
    redirect(returnToPath);
  }

  let issueResult: Awaited<ReturnType<typeof issueEmailVerificationForUser>>;
  try {
    const requestOrigin = resolveRequestOriginFromHeaders(requestHeaders);
    issueResult = await issueEmailVerificationForUser({
      actorUserId: result.data.userId,
      requestOrigin,
      returnToPath,
    });
  } catch (error) {
    logServerError("signUpAction.issueEmailVerificationForUser", error);
    redirect(
      appendQueryToPath(VERIFY_EMAIL_PATH, {
        error: "verification-email-send-failed",
        returnTo: returnToPath,
      })
    );
  }

  if (!issueResult.ok) {
    logServerWarning(
      "signUpAction.issueEmailVerificationForUser",
      "Verification email could not be issued after signup.",
      {
        actorUserId: result.data.userId,
        error: issueResult.error,
        status: issueResult.status,
      }
    );
    redirect(
      appendQueryToPath(VERIFY_EMAIL_PATH, {
        error: "verification-email-send-failed",
        returnTo: returnToPath,
      })
    );
  }

  const statusQuery =
    issueResult.data.delivery === "sent"
      ? "verification-email-sent"
      : "verification-email-queued";
  redirect(
    appendQueryToPath(VERIFY_EMAIL_PATH, {
      status: statusQuery,
      returnTo: returnToPath,
    })
  );
}
