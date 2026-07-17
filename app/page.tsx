import { redirect } from "next/navigation";
import Link from "next/link";
import type { CSSProperties } from "react";
import {
  ArrowRight,
  Bot,
  Files,
  Layers3,
  ListTodo,
  Milestone,
  Workflow,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
import { HomeAuthMethods } from "./home-auth-methods";

const outcomes = [
  "Bring teammates into the same live project workspace",
  "Keep project dates in sync with Google Calendar",
  "Make ownership clear with assignees, mentions, and due dates",
];

const workflowItems = [
  {
    title: "Project context, kept together",
    meta: "Give everyone one reliable place for project context and the files behind the work.",
    state: "Context",
    icon: Files,
  },
  {
    title: "Plans you shape",
    meta: "Build your own roadmap, connect related tasks, and see every epic move forward.",
    state: "Plan",
    icon: Milestone,
  },
  {
    title: "Delivery you can follow",
    meta: "Move work from backlog to done, follow blockers over time, and keep completed work tidy.",
    state: "Track",
    icon: Workflow,
  },
  {
    title: "Meetings become visible action",
    meta: "Turn meeting decisions into visible todos your team can act on right away.",
    state: "Act",
    icon: ListTodo,
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
  "too-many-attempts":
    "Too many authentication attempts. Please wait a few minutes and retry.",
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
  "h-12 w-full rounded-lg border border-input bg-background px-3.5 text-base outline-none transition-colors duration-200 placeholder:text-muted-foreground/80 hover:border-foreground/25 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none sm:text-sm";

function BrandMark({ productPanel = false }: { productPanel?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={cn(
          "grid size-10 place-items-center rounded-xl",
          productPanel
            ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950"
            : "bg-blue-600 text-white dark:bg-blue-500"
        )}
        aria-hidden="true"
      >
        <Layers3 className="size-5" strokeWidth={2.2} />
      </span>
      <span className="grid leading-none">
        <span className="text-base font-semibold tracking-tight">NexusDash</span>
        <span
          className={cn(
            "mt-1 text-xs",
            productPanel
              ? "text-slate-500 dark:text-slate-400"
              : "text-muted-foreground"
          )}
        >
          Project execution, connected.
        </span>
      </span>
    </div>
  );
}

function ProductPanel() {
  return (
    <section className="relative z-10 hidden min-h-dvh px-10 py-10 text-foreground transition-colors duration-200 motion-reduce:transition-none lg:flex lg:flex-col xl:px-16 xl:py-12">
      <div className="relative z-10">
        <BrandMark productPanel />
      </div>

      <div className="relative z-10 my-auto max-w-2xl py-8">
        <Badge className="mb-5 rounded-full border border-blue-500/20 bg-blue-500/[0.08] px-3 py-1 text-blue-700 hover:bg-blue-500/[0.08] dark:text-blue-200 dark:hover:bg-blue-500/[0.08]">
          Projects, people, and agents. Connected.
        </Badge>
        <h1 className="max-w-xl text-4xl font-semibold leading-[1.08] tracking-[-0.035em] xl:text-5xl">
          Turn plans into progress—without losing context.
        </h1>
        <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground xl:text-lg">
          Bring tasks, meetings, roadmaps, teammates, and trusted agents into
          one focused workspace built for steady delivery.
        </p>

        <div className="mt-7 flex max-w-xl gap-4 rounded-2xl border border-blue-500/20 bg-blue-500/[0.07] p-4 backdrop-blur-sm">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-600 text-white dark:bg-blue-400 dark:text-slate-950">
            <Bot className="size-5" strokeWidth={2} aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold">Agent access, built for real work</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Give trusted agents secure, project-scoped access to the context
              and actions they need to move work forward.
            </p>
          </div>
        </div>

        <ul className="mt-5 grid gap-2.5" aria-label="NexusDash product benefits">
          {outcomes.map((outcome) => (
            <li key={outcome} className="flex items-center gap-3 text-sm text-foreground/85">
              <span className="size-1.5 shrink-0 rounded-full bg-blue-600 dark:bg-blue-300">
                <span className="sr-only">Included:</span>
              </span>
              {outcome}
            </li>
          ))}
        </ul>

        <div className="mt-5 max-w-xl rounded-2xl border border-border/80 bg-card/75 p-4 shadow-[0_24px_70px_-52px_rgba(37,99,235,0.55)] backdrop-blur-sm">
          <div className="flex items-center justify-between border-b border-border/80 pb-3">
            <div>
              <p className="text-sm font-semibold">A connected project system</p>
              <p className="mt-1 text-xs text-muted-foreground">From context to delivery</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Workflow className="size-4 text-blue-600 dark:text-blue-300" aria-hidden="true" />
              One workflow
            </div>
          </div>
          <div className="divide-y divide-border/80">
            {workflowItems.map((item) => {
              const ItemIcon = item.icon;

              return (
                <div key={item.title} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 py-2">
                  <span className="grid size-8 place-items-center rounded-lg bg-blue-500/[0.09] text-blue-700 dark:text-blue-300">
                    <ItemIcon className="size-4" strokeWidth={1.9} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{item.title}</p>
                    <p className="mt-0.5 text-xs leading-[1.45] text-muted-foreground">{item.meta}</p>
                  </div>
                  <span className="rounded-full border border-border/80 bg-background/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                    {item.state}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <p className="relative z-10 text-xs leading-5 text-muted-foreground">
        Plan together. Focus on what matters. Deliver with confidence.
      </p>
    </section>
  );
}

function renderSignInForm({
  prefilledEmail,
  returnToPath,
}: {
  prefilledEmail?: string;
  returnToPath: string;
}) {
  return (
    <form key="signin-form" action={signInAction} className="grid gap-4">
      <input type="hidden" name="returnTo" value={returnToPath} />
      <div className="grid gap-2">
        <label htmlFor="signin-email" className="text-sm font-medium">
          Email address
        </label>
        <input
          id="signin-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="you@company.com"
          defaultValue={prefilledEmail}
          required
          maxLength={320}
          className={inputClassName}
        />
      </div>
      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-4">
          <label htmlFor="signin-password" className="text-sm font-medium">
            Password
          </label>
          <Link
            href="/forgot-password"
            className="rounded-sm text-sm font-medium text-blue-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-blue-300"
          >
            Forgot password?
          </Link>
        </div>
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
        className="mt-1 h-12 w-full rounded-lg"
        defaultLabel="Sign in to NexusDash"
        pendingLabel="Signing you in..."
      />
    </form>
  );
}

function renderSignUpForm({
  prefilledEmail,
  returnToPath,
}: {
  prefilledEmail?: string;
  returnToPath: string;
}) {
  return (
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
            className={cn(inputClassName, "pr-24")}
          />
          <HomeSignupUsernameSuffix usernameInputId="signup-username" />
        </div>
      </div>
      <div className="grid gap-2">
        <label htmlFor="signup-email" className="text-sm font-medium">
          Email address
        </label>
        <input
          id="signup-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
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
        <label htmlFor="signup-confirm-password" className="text-sm font-medium">
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
        className="h-12 w-full rounded-lg"
        defaultLabel="Create your account"
        pendingLabel="Creating your account..."
      />
    </form>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const actorUserId = await getSessionUserIdFromServer();
  const returnToPath = resolveReturnToPath(
    readQueryValue(resolvedSearchParams?.returnTo)
  );
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

  const activeForm = resolveActiveForm(
    readQueryValue(resolvedSearchParams?.form)
  );
  const prefilledEmail = resolvePrefilledEmail(
    readQueryValue(resolvedSearchParams?.email)
  );
  const isSignIn = activeForm === "signin";
  const errorCode = readQueryValue(resolvedSearchParams?.error);
  const errorMessage =
    errorCode && ERROR_MESSAGES[errorCode] ? ERROR_MESSAGES[errorCode] : null;
  const statusCode = readQueryValue(resolvedSearchParams?.status);
  const statusMessage =
    statusCode && STATUS_MESSAGES[statusCode] ? STATUS_MESSAGES[statusCode] : null;
  const socialProviders = getEnabledSocialAuthProviders();

  return (
    <main className="relative isolate grid min-h-dvh overflow-hidden bg-background lg:grid-cols-[minmax(0,1fr)_minmax(520px,0.86fr)]">
      <div
        className="home-entry-color-field pointer-events-none absolute hidden lg:block"
        aria-hidden="true"
      />
      <svg
        className="home-project-constellation pointer-events-none absolute inset-0 hidden size-full lg:block"
        viewBox="0 0 1600 1000"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="project-constellation-edge" x1="0%" x2="100%">
            <stop offset="0" stopColor="rgb(37 99 235)" stopOpacity="0.4" />
            <stop offset="0.6" stopColor="rgb(79 70 229)" stopOpacity="0.2" />
            <stop offset="1" stopColor="rgb(79 70 229)" stopOpacity="0" />
          </linearGradient>
        </defs>

        <g className="home-project-constellation__network">
          <g
            className="home-project-constellation__edges"
            fill="none"
            stroke="url(#project-constellation-edge)"
          >
            <path d="M520 416 C612 370 650 326 730 302" />
            <path d="M520 416 C626 430 702 444 806 474" />
            <path d="M730 302 C794 346 806 402 806 474" />
            <path d="M806 474 C754 526 700 568 652 626" />
            <path d="M806 474 C872 526 896 612 866 716" />
            <path d="M652 626 C718 684 782 712 866 716" />
            <path d="M806 474 C930 438 1030 408 1160 430" />
            <path d="M866 716 C972 672 1056 630 1160 650" />
            <path d="M1160 430 C1202 500 1204 574 1160 650" />
          </g>

          {[
            [520, 416],
            [730, 302],
            [806, 474],
            [652, 626],
            [866, 716],
            [1160, 430],
            [1160, 650],
          ].map(([x, y], index) => (
            <g
              key={`${x}-${y}`}
              className="home-project-constellation__node"
              transform={`translate(${x} ${y})`}
              style={{ "--constellation-index": index } as CSSProperties}
            >
              <circle
                className="home-project-constellation__pulse"
                r="9"
                fill="none"
              />
              <circle className="home-project-constellation__core" r="3.5" />
            </g>
          ))}
        </g>
      </svg>
      <ProductPanel />

      <section className="relative z-10 flex min-h-dvh items-start justify-center px-4 pb-8 pt-20 sm:items-center sm:px-8 sm:py-20 lg:px-12">
        <div className="w-full max-w-[440px]">
          <div className="mb-7 lg:hidden">
            <BrandMark />
            <h1 className="mt-6 max-w-sm text-2xl font-semibold leading-tight tracking-[-0.025em] sm:text-3xl">
              Bring every project into focus.
            </h1>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              Plan work, keep context close, and move forward with clear next steps.
            </p>
          </div>

          <Card className="border-border/80 bg-card shadow-none sm:rounded-2xl sm:shadow-[0_24px_70px_-48px_rgba(15,23,42,0.55)]">
            <CardHeader className="space-y-6 p-5 pb-4 sm:p-7 sm:pb-5">
              <nav
                aria-label="Choose sign in or sign up"
                className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1"
              >
                <HomeAuthModeToggleLink
                  targetForm="signin"
                  returnTo={returnToPath}
                  ariaCurrent={isSignIn ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center justify-center rounded-lg px-3 text-center text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-muted motion-reduce:transition-none",
                    isSignIn
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-background/50 hover:text-foreground"
                  )}
                >
                  Sign in
                </HomeAuthModeToggleLink>
                <HomeAuthModeToggleLink
                  targetForm="signup"
                  returnTo={returnToPath}
                  ariaCurrent={!isSignIn ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center justify-center rounded-lg px-3 text-center text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-muted motion-reduce:transition-none",
                    !isSignIn
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-background/50 hover:text-foreground"
                  )}
                >
                  Sign up
                </HomeAuthModeToggleLink>
              </nav>

              <div className="space-y-1.5">
                <CardTitle className="text-2xl tracking-[-0.025em] sm:text-[1.75rem]">
                  {isSignIn ? "Welcome back" : "Start your workspace"}
                </CardTitle>
                <CardDescription className="text-sm leading-6">
                  {isSignIn
                    ? "Sign in to pick up where you left off."
                    : "Create your account and bring your next project into focus."}
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="grid gap-4 p-5 pt-0 sm:p-7 sm:pt-0">
              {errorMessage ? (
                <div
                  role="alert"
                  className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm leading-5 text-destructive"
                >
                  {errorMessage}
                </div>
              ) : null}

              {statusMessage ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="rounded-lg border border-emerald-600/35 bg-emerald-500/10 px-4 py-3 text-sm leading-5 text-emerald-700 dark:text-emerald-300"
                >
                  {statusMessage}
                </div>
              ) : null}

              {socialProviders.length > 0 ? (
                <HomeAuthMethods
                  defaultEmailExpanded={Boolean(
                    errorMessage || statusMessage || prefilledEmail
                  )}
                  providerOptions={socialProviders.map(({ provider }) => (
                    <HomeSocialProviderButton
                      key={provider}
                      provider={provider}
                      form={activeForm}
                      returnTo={returnToPath}
                    />
                  ))}
                >
                  {isSignIn ? (
                    renderSignInForm({ returnToPath, prefilledEmail })
                  ) : (
                    renderSignUpForm({ returnToPath, prefilledEmail })
                  )}
                </HomeAuthMethods>
              ) : isSignIn ? (
                renderSignInForm({ returnToPath, prefilledEmail })
              ) : (
                renderSignUpForm({ returnToPath, prefilledEmail })
              )}

              <div className="flex items-center justify-between gap-4 border-t border-border pt-4 text-sm text-muted-foreground">
                <p>
                  {isSignIn ? "New to NexusDash?" : "Already have an account?"}{" "}
                  <HomeAuthModeToggleLink
                    targetForm={isSignIn ? "signup" : "signin"}
                    returnTo={returnToPath}
                    className="rounded-sm font-semibold text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {isSignIn ? "Create an account" : "Sign in"}
                  </HomeAuthModeToggleLink>
                </p>
                <ArrowRight className="hidden size-4 shrink-0 sm:block" aria-hidden="true" />
              </div>
            </CardContent>
          </Card>

          <p className="mt-6 text-center text-xs leading-5 text-muted-foreground lg:hidden">
            Plan together. Focus on what matters. Deliver with confidence.
          </p>
        </div>
      </section>
    </main>
  );
}
