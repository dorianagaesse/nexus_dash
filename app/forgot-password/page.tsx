import Link from "next/link";

import { AutoDismissingAlert } from "@/components/auto-dismissing-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { requestPasswordResetAction } from "./actions";

type SearchParams = Record<string, string | string[] | undefined>;

const STATUS_MESSAGES: Record<string, string> = {
  "request-submitted":
    "If an account matches that email, a password reset link is on its way.",
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

export default function ForgotPasswordPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const statusCode = readQueryValue(searchParams?.status);
  const statusMessage =
    statusCode && STATUS_MESSAGES[statusCode] ? STATUS_MESSAGES[statusCode] : null;

  return (
    <main className="container py-16">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <Badge variant="secondary" className="w-fit">
          Password recovery
        </Badge>

        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Forgot password</h1>
          <p className="text-sm text-muted-foreground">
            Enter your account email and we will send you a secure password reset
            link.
          </p>
        </div>

        {statusMessage ? (
          <AutoDismissingAlert
            message={statusMessage}
            className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-200"
          />
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Request reset link</CardTitle>
            <CardDescription>
              For security, we always show the same message after submission.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form action={requestPasswordResetAction} className="grid gap-4">
              <div className="grid gap-2">
                <label htmlFor="forgot-email" className="text-sm font-medium">
                  Email
                </label>
                <input
                  id="forgot-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  required
                  maxLength={320}
                  className="h-11 rounded-md border border-input bg-background px-3 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                />
              </div>
              <Button type="submit">Send reset link</Button>
            </form>

            <Button asChild variant="ghost">
              <Link href="/?form=signin">Back to sign in</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
