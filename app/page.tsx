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
import { MIN_PASSWORD_LENGTH } from "@/lib/services/credential-auth-service";

import { signInAction, signUpAction } from "./home-auth-actions";
import { AuthSubmitButton } from "./auth-submit-button";

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
  "password-too-short": `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
  "password-too-long": "Password is too long.",
  "invalid-credentials": "Incorrect email or password.",
  "email-in-use": "An account with this email already exists.",
  "auth-unavailable": "Authentication is temporarily unavailable. Please retry.",
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
  "h-11 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 placeholder:text-slate-400 outline-none transition focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 dark:border-slate-300 dark:bg-white dark:text-slate-900 dark:placeholder:text-slate-500 dark:focus-visible:ring-sky-600 dark:focus-visible:ring-offset-white";

export default async function Home({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const actorUserId = await getSessionUserIdFromServer();
  if (actorUserId) {
    redirect("/projects");
  }

  const formValue = readQueryValue(searchParams?.form);
  const activeForm = resolveActiveForm(formValue);
  const isSignIn = activeForm === "signin";
  const errorCode = readQueryValue(searchParams?.error);
  const errorMessage =
    errorCode && ERROR_MESSAGES[errorCode] ? ERROR_MESSAGES[errorCode] : null;

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

        <Card className="border border-slate-800/80 bg-slate-950 text-slate-100 shadow-2xl shadow-black/30 dark:border-slate-200 dark:bg-white dark:text-slate-900 dark:shadow-black/20">
          <CardHeader className="space-y-4">
            <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-800 bg-slate-900 p-1 dark:border-slate-200 dark:bg-slate-100">
              <Link
                href="/?form=signin"
                aria-current={isSignIn ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-2 text-center text-sm font-medium transition",
                  isSignIn
                    ? "bg-slate-100 text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100"
                    : "text-slate-400 hover:text-slate-200 dark:text-slate-500 dark:hover:text-slate-800"
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
                    ? "bg-slate-100 text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100"
                    : "text-slate-400 hover:text-slate-200 dark:text-slate-500 dark:hover:text-slate-800"
                )}
              >
                Sign up
              </Link>
            </div>
            <div className="space-y-1">
              <CardTitle className="text-2xl">
                {isSignIn ? "Welcome back" : "Create your account"}
              </CardTitle>
              <CardDescription className="text-slate-300 dark:text-slate-600">
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
                className="rounded-md border border-rose-400/40 bg-rose-500/15 px-4 py-3 text-sm text-rose-200 dark:text-rose-700"
              >
                {errorMessage}
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
                  <p className="text-xs text-slate-400 dark:text-slate-600">
                    Use at least {MIN_PASSWORD_LENGTH} characters.
                  </p>
                </div>
                <Button type="submit" variant="secondary" className="w-full">
                  Create workspace account
                </Button>
              </form>
            )}

            <p className="text-sm text-slate-400 dark:text-slate-600">
              {isSignIn ? "New to NexusDash?" : "Already have an account?"}{" "}
              <Link
                href={isSignIn ? "/?form=signup" : "/?form=signin"}
                className="font-medium text-slate-100 underline-offset-4 hover:underline dark:text-slate-900"
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
