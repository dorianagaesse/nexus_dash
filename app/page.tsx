import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight, LockKeyhole, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getSessionUserIdFromServer } from "@/lib/auth/session-user";
import { isLiveProductionDeployment } from "@/lib/env.server";
import { normalizeReturnToPath } from "@/lib/navigation/return-to";
import {
  MAX_USERNAME_LENGTH,
  MIN_PASSWORD_LENGTH,
  MIN_USERNAME_LENGTH,
} from "@/lib/services/credential-auth-service";
import { isEmailVerifiedForUser } from "@/lib/services/email-verification-service";
import { getEnabledSocialAuthProviders } from "@/lib/social-auth";

import { signInAction, signUpAction } from "./home-auth-actions";
import { AuthSubmitButton } from "./auth-submit-button";
import { HomeSocialProviderButton } from "./home-social-provider-button";
import {
  HomeSignupEmailFeedback,
  HomeSignupPasswordFeedback,
  HomeSignupUsernameSuffix,
} from "./home-signup-live-feedback";
import { HomeAuthModeToggleLink } from "./home-auth-mode-toggle-link";

const highlights = [
  {
    title: "Shared Project Hub",
    description:
      "Keep planning, context, and delivery updates in one workspace instead of scattered tools.",
  },
  {
    title: "Execution Flow",
    description:
      "Move tasks through Backlog, In Progress, Blocked, and Done with zero context switching.",
  },
  {
    title: "Calendar Context",
    description:
      "Bring key events into project execution so meetings and delivery stay aligned.",
  },
];

type SearchParams = Record<string, string | string[] | undefined>;
type HomeAuthForm = "signin" | "signup";

const ERROR_MESSAGES: Record<string, string> = {
  "invalid-email": "Enter a valid email address.",
  "invalid-username":
    "Username must be 3-20 characters and use only lowercase letters, numbers, dots, or underscores.",
  "username-in-use": "Could not allocate a unique username tag. Please retry.",
  "password-too-short": `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
  "password-too-long": "Password is too long.",
  "password-requirements-not-met":
    "Password must include uppercase, lowercase, number, and symbol characters.",
  "password-confirmation-mismatch": "Passwords do not match.",
  "invalid-credentials": "Incorrect email or password.",
  "email-in-use": "An account with this email already exists.",
  "auth-unavailable": "Authentication is temporarily unavailable. Please retry.",
  "social-provider-disabled":
    "That sign-in provider is not configured yet in this environment.",
  "social-auth-cancelled": "Sign-in was cancelled before completion.",
  "social-email-unavailable":
    "Your provider did not return a usable email address. Try another provider or email sign-in.",
  "social-email-unverified":
    "Your provider email is not verified. Verify it with the provider first, then retry.",
  "social-auth-failed": "Social sign-in failed. Please retry.",
};

const STATUS_MESSAGES: Record<string, string> = {
  "email-verified": "Email verified. Sign in to continue.",
  "password-reset-success":
    "Password reset complete. Sign in with your new password.",
};

function readQueryValue(value: string | string[] | undefined): string | null {
  if (!value) {
    return null;
  }

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

function resolveActiveForm(value: string | null): HomeAuthForm {
  return value === "signup" ? "signup" : "signin";
}

function resolvePrefilledEmail(value: string | null): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim();
  if (!normalized || normalized.length > 320) {
    return undefined;
  }

  return normalized;
}

function resolveReturnToPath(value: string | null): string {
  return normalizeReturnToPath(value, "/projects");
}

const inputClassName =
  "h-11 rounded-md border border-input bg-background px-3 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export default async function Home(
  props: {
    searchParams?: Promise<SearchParams>;
  }
) {
  const resolvedSearchParams = await props.searchParams;
  const actorUserId = await getSessionUserIdFromServer();
  const returnToPath = resolveReturnToPath(readQueryValue(resolvedSearchParams?.returnTo));
  if (actorUserId) {
    if (!isLiveProductionDeployment()) {
      redirect(returnToPath);
    }

    const emailVerified = await isEmailVerifiedForUser(actorUserId);
    redirect(
      emailVerified
        ? returnToPath
        : `/verify-email?returnTo=${encodeURIComponent(returnToPath)}`
    );
  }

  const formValue = readQueryValue(resolvedSearchParams?.form);
  const activeForm = resolveActiveForm(formValue);
  const prefilledEmail = resolvePrefilledEmail(readQueryValue(resolvedSearchParams?.email));
  const isSignIn = activeForm === "signin";
  const errorCode = readQueryValue(resolvedSearchParams?.error);
  const errorMessage =
    errorCode && ERROR_MESSAGES[errorCode] ? ERROR_MESSAGES[errorCode] : null;
  const statusCode = readQueryValue(resolvedSearchParams?.status);
  const statusMessage =
    statusCode && STATUS_MESSAGES[statusCode] ? STATUS_MESSAGES[statusCode] : null;
  const socialProviders = getEnabledSocialAuthProviders();

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(148,163,184,0.14),transparent_38%),radial-gradient(circle_at_78%_18%,rgba(14,165,233,0.12),transparent_26%),linear-gradient(to_bottom,hsl(var(--background)),hsl(var(--background)),hsl(var(--muted)/0.26))] text-foreground">
      <div className="pointer-events-none absolute inset-0 opacity-40">
        <div className="absolute left-[-20%] top-[-12rem] h-[28rem] w-[28rem] rounded-full bg-slate-500/10 blur-3xl" />
        <div className="absolute right-[-10%] top-[8rem] h-[20rem] w-[20rem] rounded-full bg-sky-400/10 blur-3xl" />
      </div>

      <main className="container relative z-10 grid min-h-screen items-center gap-10 py-10 lg:grid-cols-[1.15fr_minmax(390px,470px)] lg:gap-16 lg:py-16">
        <section className="space-y-8 lg:space-y-10">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <Badge variant="secondary" className="rounded-full px-3 py-1">
              NexusDash workspace
            </Badge>
            <Badge variant="outline" className="rounded-full px-3 py-1">
              Secure multi-user delivery
            </Badge>
          </div>
          <div className="space-y-5">
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight md:text-5xl lg:text-[3.4rem]">
              Sign in fast, keep delivery context tight, and move work without losing the thread.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
              Credentials stay available, but Google and GitHub entry can sit beside them
              cleanly once configured. The goal is one calm auth surface, not three
              disconnected flows.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {highlights.map((item, index) => (
              <Card
                key={item.title}
                className="border-border/70 bg-card/70 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.7)] backdrop-blur"
              >
                <CardHeader className="space-y-3">
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    0{index + 1}
                  </span>
                  <CardTitle className="text-lg">{item.title}</CardTitle>
                  <CardDescription>{item.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>

          <Card className="border-border/70 bg-card/60 backdrop-blur">
            <CardContent className="grid gap-4 p-5 md:grid-cols-[1fr_auto] md:items-center">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Sparkles className="h-4 w-4 text-sky-500" />
                  Modern auth entry
                </div>
                <p className="text-sm leading-6 text-muted-foreground">
                  Social sign-in is layered into the same session model as email/password,
                  so we keep one authorization boundary, one account system, and one path
                  into projects.
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-border/70 bg-background/60 px-4 py-2 text-sm text-muted-foreground">
                <LockKeyhole className="h-4 w-4" />
                Session-backed
              </div>
            </CardContent>
          </Card>
        </section>

        <Card className="border-border/70 bg-card/95 shadow-2xl shadow-black/20">
          <CardHeader className="space-y-4">
            <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
              <HomeAuthModeToggleLink
                targetForm="signin"
                returnTo={returnToPath}
                ariaCurrent={isSignIn ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-2 text-center text-sm font-medium transition",
                  isSignIn
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Sign in
              </HomeAuthModeToggleLink>
              <HomeAuthModeToggleLink
                targetForm="signup"
                returnTo={returnToPath}
                ariaCurrent={!isSignIn ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-2 text-center text-sm font-medium transition",
                  !isSignIn
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Sign up
              </HomeAuthModeToggleLink>
            </div>
            <div className="space-y-1">
              <CardTitle className="text-2xl">
                {isSignIn ? "Welcome back" : "Create your account"}
              </CardTitle>
              <CardDescription>
                {isSignIn
                  ? "Choose the fastest way back into your workspace."
                  : "Start with social sign-in or create an email-based account."}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4">
            {errorMessage ? (
              <div
                role="alert"
                className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
              >
                {errorMessage}
              </div>
            ) : null}

            {statusMessage ? (
              <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-200">
                {statusMessage}
              </div>
            ) : null}

            {socialProviders.length > 0 ? (
              <div className="grid gap-2">
                {socialProviders.map(({ provider }) => (
                  <HomeSocialProviderButton
                    key={provider}
                    provider={provider}
                    form={activeForm}
                    returnTo={returnToPath}
                  />
                ))}
                <div className="relative my-1">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border/70" />
                  </div>
                  <div className="relative flex justify-center text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    <span className="bg-card px-3">Or continue with email</span>
                  </div>
                </div>
              </div>
            ) : null}

            {isSignIn ? (
              <form key="signin-form" action={signInAction} className="grid gap-4">
                <input type="hidden" name="returnTo" value={returnToPath} />
                <div className="grid gap-2">
                  <label htmlFor="signin-email" className="text-sm font-medium">
                    Email
                  </label>
                  <input
                    id="signin-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@company.com"
                    defaultValue={prefilledEmail}
                    required
                    maxLength={320}
                    className={inputClassName}
                  />
                </div>
                <div className="grid gap-2">
                  <label htmlFor="signin-password" className="text-sm font-medium">
                    Password
                  </label>
                  <input
                    id="signin-password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    required
                    maxLength={128}
                    className={inputClassName}
                  />
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      Session-backed sign-in
                    </span>
                    <Link
                      href="/forgot-password"
                      className="font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                    >
                      Forgot password?
                    </Link>
                  </div>
                </div>
                <AuthSubmitButton
                  className="w-full"
                  defaultLabel="Continue to dashboard"
                  pendingLabel="Signing you in..."
                />
              </form>
            ) : (
              <form key="signup-form" action={signUpAction} className="grid gap-4">
                <input type="hidden" name="returnTo" value={returnToPath} />
                <div className="grid gap-2">
                  <label htmlFor="signup-username" className="text-sm font-medium">
                    Username
                  </label>
                  <div className="relative">
                    <input
                      id="signup-username"
                      name="username"
                      type="text"
                      autoComplete="username"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      placeholder="your.name"
                      required
                      minLength={MIN_USERNAME_LENGTH}
                      maxLength={MAX_USERNAME_LENGTH}
                      pattern="[A-Za-z0-9._]+"
                      className={cn(inputClassName, "w-full pr-24")}
                    />
                    <HomeSignupUsernameSuffix usernameInputId="signup-username" />
                  </div>
                </div>
                <div className="grid gap-2">
                  <label htmlFor="signup-email" className="text-sm font-medium">
                    Email
                  </label>
                  <input
                    id="signup-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@company.com"
                    defaultValue={prefilledEmail}
                    required
                    maxLength={320}
                    className={inputClassName}
                  />
                  <HomeSignupEmailFeedback emailInputId="signup-email" />
                </div>
                <div className="grid gap-2">
                  <label htmlFor="signup-password" className="text-sm font-medium">
                    Password
                  </label>
                  <input
                    id="signup-password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Create a strong password"
                    required
                    minLength={MIN_PASSWORD_LENGTH}
                    maxLength={128}
                    className={inputClassName}
                  />
                </div>
                <div className="grid gap-2">
                  <label
                    htmlFor="signup-confirm-password"
                    className="text-sm font-medium"
                  >
                    Confirm password
                  </label>
                  <input
                    id="signup-confirm-password"
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Re-enter your password"
                    required
                    minLength={MIN_PASSWORD_LENGTH}
                    maxLength={128}
                    className={inputClassName}
                  />
                </div>
                <HomeSignupPasswordFeedback
                  passwordInputId="signup-password"
                  confirmPasswordInputId="signup-confirm-password"
                  minPasswordLength={MIN_PASSWORD_LENGTH}
                />
                <AuthSubmitButton
                  className="w-full"
                  defaultLabel="Create workspace account"
                  pendingLabel="Creating account..."
                />
              </form>
            )}

            <div className="flex items-center justify-between gap-4 border-t border-border/70 pt-2 text-sm text-muted-foreground">
              <p>
                {isSignIn ? "New to NexusDash?" : "Already have an account?"}{" "}
                <HomeAuthModeToggleLink
                  targetForm={isSignIn ? "signup" : "signin"}
                  returnTo={returnToPath}
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                >
                  {isSignIn ? "Create an account" : "Sign in"}
                </HomeAuthModeToggleLink>
              </p>
              <ArrowRight className="hidden h-4 w-4 shrink-0 md:block" />
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
