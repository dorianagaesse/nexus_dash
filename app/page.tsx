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

const highlights = [
  {
    title: "Project Hub",
    description: "Centralize projects with focused dashboards and quick access.",
  },
  {
    title: "Kanban Flow",
    description: "Track work across Backlog, In Progress, Blocked, and Done.",
  },
  {
    title: "Calendar Sync",
    description: "Surface upcoming meetings from your Google Calendar.",
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
  "h-11 rounded-md border border-input bg-background px-3 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

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
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30 text-foreground">
      <main className="container grid min-h-screen items-center gap-8 py-10 lg:grid-cols-[1.2fr_minmax(360px,460px)] lg:gap-12 lg:py-16">
        <section className="space-y-8">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="secondary">NexusDash workspace</Badge>
            <Badge variant="secondary">Authentication required</Badge>
            <Badge variant="outline">Email + password</Badge>
          </div>
          <div className="space-y-4 md:space-y-5">
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight md:text-5xl">
              Secure access to your project hub.
            </h1>
            <p className="max-w-2xl text-base text-muted-foreground md:text-lg">
              Keep project planning, Kanban execution, resources, and calendar events
              in one protected workflow.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {highlights.map((item) => (
              <Card key={item.title} className="bg-card/70 backdrop-blur">
                <CardHeader className="space-y-2">
                  <CardTitle className="text-lg">{item.title}</CardTitle>
                  <CardDescription>{item.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>

        <Card className="border-border/70 bg-card/95 shadow-lg">
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
                  ? "Use your email and password to continue to your projects."
                  : "Get started with a new NexusDash account in less than a minute."}
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
                    required
                    maxLength={128}
                    className={inputClassName}
                  />
                </div>
                <Button type="submit" className="w-full">
                  Sign in
                </Button>
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
                    required
                    minLength={MIN_PASSWORD_LENGTH}
                    maxLength={128}
                    className={inputClassName}
                  />
                  <p className="text-xs text-muted-foreground">
                    Use at least {MIN_PASSWORD_LENGTH} characters.
                  </p>
                </div>
                <Button type="submit" variant="secondary" className="w-full">
                  Create account
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
