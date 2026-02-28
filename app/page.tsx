import { redirect } from "next/navigation";
import Link from "next/link";

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
import {
  MAX_USERNAME_LENGTH,
  MIN_PASSWORD_LENGTH,
  MIN_USERNAME_LENGTH,
} from "@/lib/services/credential-auth-service";
import { isEmailVerifiedForUser } from "@/lib/services/email-verification-service";

import { signInAction, signUpAction } from "./home-auth-actions";
import { AuthSubmitButton } from "./auth-submit-button";
import {
  HomeSignupEmailFeedback,
  HomeSignupPasswordFeedback,
  HomeSignupUsernameSuffix,
} from "./home-signup-live-feedback";

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
  "password-too-short": `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
  "password-too-long": "Password is too long.",
  "password-requirements-not-met":
    "Password must include uppercase, lowercase, number, and symbol characters.",
  "password-confirmation-mismatch": "Passwords do not match.",
  "invalid-credentials": "Incorrect email or password.",
  "email-in-use": "An account with this email already exists.",
  "auth-unavailable": "Authentication is temporarily unavailable. Please retry.",
};

const STATUS_MESSAGES: Record<string, string> = {
  "email-verified": "Email verified. Sign in to continue.",
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

const inputClassName =
  "h-11 rounded-md border border-input bg-background px-3 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export default async function Home({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const actorUserId = await getSessionUserIdFromServer();
  if (actorUserId) {
    if (!isLiveProductionDeployment()) {
      redirect("/projects");
    }

    const emailVerified = await isEmailVerifiedForUser(actorUserId);
    redirect(emailVerified ? "/projects" : "/verify-email");
  }

  const formValue = readQueryValue(searchParams?.form);
  const activeForm = resolveActiveForm(formValue);
  const isSignIn = activeForm === "signin";
  const errorCode = readQueryValue(searchParams?.error);
  const errorMessage =
    errorCode && ERROR_MESSAGES[errorCode] ? ERROR_MESSAGES[errorCode] : null;
  const statusCode = readQueryValue(searchParams?.status);
  const statusMessage =
    statusCode && STATUS_MESSAGES[statusCode] ? STATUS_MESSAGES[statusCode] : null;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,#1f293710,transparent_45%),radial-gradient(circle_at_85%_15%,#0ea5e910,transparent_28%),linear-gradient(to_bottom,hsl(var(--background)),hsl(var(--background)),hsl(var(--muted)/0.3))] text-foreground">
      <div className="pointer-events-none absolute inset-0 opacity-40">
        <div className="absolute left-[-20%] top-[-12rem] h-[28rem] w-[28rem] rounded-full bg-slate-500/10 blur-3xl" />
        <div className="absolute right-[-10%] top-[8rem] h-[20rem] w-[20rem] rounded-full bg-sky-400/10 blur-3xl" />
      </div>

      <main className="container relative z-10 grid min-h-screen items-center gap-8 py-10 lg:grid-cols-[1.2fr_minmax(360px,460px)] lg:gap-14 lg:py-16">
        <section className="space-y-8">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="secondary">NexusDash workspace</Badge>
            <Badge variant="outline">Next.js 14 + Server Actions</Badge>
            <Badge variant="outline">Prisma + Supabase PostgreSQL</Badge>
          </div>
          <div className="space-y-4 md:space-y-5">
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight md:text-5xl">
              Run projects from one focused command center.
            </h1>
            <p className="max-w-2xl text-base text-muted-foreground md:text-lg">
              Capture context, move work across Kanban, and stay aligned with calendar
              events, all behind a protected multi-user workspace.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {highlights.map((item, index) => (
              <Card key={item.title} className="border-border/70 bg-card/70 backdrop-blur">
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
        </section>

        <Card className="border-border/70 bg-card/95 shadow-2xl shadow-black/20">
          <CardHeader className="space-y-4">
            <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
              <Link
                href="/?form=signin"
                aria-current={isSignIn ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-2 text-center text-sm font-medium transition",
                  isSignIn
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Sign in
              </Link>
              <Link
                href="/?form=signup"
                aria-current={!isSignIn ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-2 text-center text-sm font-medium transition",
                  !isSignIn
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Sign up
              </Link>
            </div>
            <div className="space-y-1">
              <CardTitle className="text-2xl">
                {isSignIn ? "Welcome back" : "Create your account"}
              </CardTitle>
              <CardDescription>
                {isSignIn
                  ? "Use your email and password to continue to your dashboard."
                  : "Create your account and start building in minutes."}
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

            {isSignIn ? (
              <form action={signInAction} className="grid gap-4">
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
                </div>
                <AuthSubmitButton
                  className="w-full"
                  defaultLabel="Continue to dashboard"
                  pendingLabel="Signing you in..."
                />
              </form>
            ) : (
              <form action={signUpAction} className="grid gap-4">
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
                      placeholder="your.name"
                      required
                      minLength={MIN_USERNAME_LENGTH}
                      maxLength={MAX_USERNAME_LENGTH}
                      pattern="[a-z0-9._]+"
                      className={cn(inputClassName, "w-full pr-24")}
                    />
                    <HomeSignupUsernameSuffix usernameInputId="signup-username" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Use {MIN_USERNAME_LENGTH}-{MAX_USERNAME_LENGTH} lowercase letters,
                    numbers, dots, or underscores.
                  </p>
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
                  <p className="text-xs text-muted-foreground">
                    Use at least {MIN_PASSWORD_LENGTH} characters with uppercase,
                    lowercase, number, and symbol.
                  </p>
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
                <Button type="submit" variant="secondary" className="w-full">
                  Create workspace account
                </Button>
              </form>
            )}

            <p className="text-sm text-muted-foreground">
              {isSignIn ? "New to NexusDash?" : "Already have an account?"}{" "}
              <Link
                href={isSignIn ? "/?form=signup" : "/?form=signin"}
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                {isSignIn ? "Create an account" : "Sign in"}
              </Link>
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
