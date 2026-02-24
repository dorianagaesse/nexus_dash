import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

export default async function Home({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const actorUserId = await getSessionUserIdFromServer();
  if (actorUserId) {
    redirect("/projects");
  }

  const errorForm = readQueryValue(searchParams?.form);
  const errorCode = readQueryValue(searchParams?.error);
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] : null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="container flex min-h-screen flex-col justify-center gap-10 py-16">
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="secondary">Authentication required</Badge>
            <Badge variant="outline">Email + password</Badge>
          </div>
          <div className="space-y-4">
            <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
              Sign in to access your NexusDash projects.
            </h1>
            <p className="max-w-2xl text-base text-muted-foreground md:text-lg">
              Manage projects, Kanban tasks, resources, and calendar events from one
              protected workspace.
            </p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Sign in</CardTitle>
              <CardDescription>Use your existing account credentials.</CardDescription>
            </CardHeader>
            <CardContent>
              {errorForm === "signin" && errorMessage ? (
                <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {errorMessage}
                </div>
              ) : null}
              <form action={signInAction} className="grid gap-3">
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
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
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
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  />
                </div>
                <Button type="submit">Sign in</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Sign up</CardTitle>
              <CardDescription>Create a new account to get started.</CardDescription>
            </CardHeader>
            <CardContent>
              {errorForm === "signup" && errorMessage ? (
                <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {errorMessage}
                </div>
              ) : null}
              <form action={signUpAction} className="grid gap-3">
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
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
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
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Use at least {MIN_PASSWORD_LENGTH} characters.
                  </p>
                </div>
                <Button type="submit" variant="secondary">
                  Sign up
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {highlights.map((item) => (
            <Card key={item.title}>
              <CardHeader className="space-y-2">
                <CardTitle className="text-lg">{item.title}</CardTitle>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
