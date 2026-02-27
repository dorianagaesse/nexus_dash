"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSessionUserIdFromServer } from "@/lib/auth/session-user";
import { isProductionEnvironment } from "@/lib/env.server";
import { resolveRequestOriginFromHeaders } from "@/lib/http/request-origin";
import { logServerError, logServerWarning } from "@/lib/observability/logger";
import {
  signInWithEmailPassword,
  signUpWithEmailPassword,
} from "@/lib/services/credential-auth-service";
import {
  isEmailVerifiedForUser,
  issueEmailVerificationForUser,
} from "@/lib/services/email-verification-service";
import {
  PRIMARY_SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/services/session-service";

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

function redirectWithError(form: HomeAuthForm, error: string): never {
  redirect(`${HOME_PATH}?form=${form}&error=${error}`);
}

function setSessionCookie(sessionToken: string, expiresAt: Date): void {
  const secure = isProductionEnvironment();

  cookies().set(PRIMARY_SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

async function resolvePostAuthRedirectPath(actorUserId: string): Promise<string> {
  const emailVerified = await isEmailVerifiedForUser(actorUserId);
  return emailVerified ? PROJECTS_PATH : VERIFY_EMAIL_PATH;
}

export async function signInAction(formData: FormData): Promise<void> {
  const actorUserId = await getSessionUserIdFromServer();
  if (actorUserId) {
    const redirectPath = await resolvePostAuthRedirectPath(actorUserId);
    redirect(redirectPath);
  }

  const email = readText(formData, "email");
  const password = readText(formData, "password");

  let result: Awaited<ReturnType<typeof signInWithEmailPassword>>;
  try {
    result = await signInWithEmailPassword({
      emailRaw: email,
      passwordRaw: password,
    });
  } catch (error) {
    logServerError("signInAction", error);
    redirectWithError("signin", "auth-unavailable");
  }

  if (!result.ok) {
    redirectWithError("signin", result.error);
  }

  setSessionCookie(result.data.sessionToken, result.data.expiresAt);
  if (!result.data.emailVerified) {
    redirect(`${VERIFY_EMAIL_PATH}?status=verification-required`);
  }

  redirect(PROJECTS_PATH);
}

export async function signUpAction(formData: FormData): Promise<void> {
  const actorUserId = await getSessionUserIdFromServer();
  if (actorUserId) {
    const redirectPath = await resolvePostAuthRedirectPath(actorUserId);
    redirect(redirectPath);
  }

  const email = readText(formData, "email");
  const username = readText(formData, "username");
  const password = readText(formData, "password");
  const confirmPassword = readText(formData, "confirmPassword");

  let result: Awaited<ReturnType<typeof signUpWithEmailPassword>>;
  try {
    result = await signUpWithEmailPassword({
      emailRaw: email,
      usernameRaw: username,
      passwordRaw: password,
      passwordConfirmationRaw: confirmPassword,
    });
  } catch (error) {
    logServerError("signUpAction", error);
    redirectWithError("signup", "auth-unavailable");
  }

  if (!result.ok) {
    redirectWithError("signup", result.error);
  }

  setSessionCookie(result.data.sessionToken, result.data.expiresAt);

  let issueResult: Awaited<ReturnType<typeof issueEmailVerificationForUser>>;
  try {
    const requestOrigin = resolveRequestOriginFromHeaders(headers());
    issueResult = await issueEmailVerificationForUser({
      actorUserId: result.data.userId,
      requestOrigin,
    });
  } catch (error) {
    logServerError("signUpAction.issueEmailVerificationForUser", error);
    redirect(`${VERIFY_EMAIL_PATH}?error=verification-email-send-failed`);
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
    redirect(`${VERIFY_EMAIL_PATH}?error=verification-email-send-failed`);
  }

  const statusQuery =
    issueResult.data.delivery === "sent"
      ? "verification-email-sent"
      : "verification-email-queued";
  redirect(`${VERIFY_EMAIL_PATH}?status=${statusQuery}`);
}
