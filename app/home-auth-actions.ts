"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getSessionUserIdFromServer } from "@/lib/auth/session-user";
import { isProductionEnvironment } from "@/lib/env.server";
import { logServerError } from "@/lib/observability/logger";
import {
  signInWithEmailPassword,
  signUpWithEmailPassword,
} from "@/lib/services/credential-auth-service";
import {
  PRIMARY_SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/services/session-service";

const HOME_PATH = "/";
const PROJECTS_PATH = "/projects";

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

export async function signInAction(formData: FormData): Promise<void> {
  const actorUserId = await getSessionUserIdFromServer();
  if (actorUserId) {
    redirect(PROJECTS_PATH);
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
  redirect(PROJECTS_PATH);
}

export async function signUpAction(formData: FormData): Promise<void> {
  const actorUserId = await getSessionUserIdFromServer();
  if (actorUserId) {
    redirect(PROJECTS_PATH);
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
  redirect(PROJECTS_PATH);
}
