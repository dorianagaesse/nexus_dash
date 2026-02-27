import Link from "next/link";

import { AutoDismissingAlert } from "@/components/auto-dismissing-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { validatePasswordResetToken } from "@/lib/services/password-reset-service";
import { MIN_PASSWORD_LENGTH } from "@/lib/services/credential-auth-service";

import { resetPasswordAction } from "./actions";

type SearchParams = Record<string, string | string[] | undefined>;

const ERROR_MESSAGES: Record<string, string> = {
  "invalid-reset-link":
    "This reset link is invalid. Request a new password reset email.",
  "expired-reset-link":
    "This reset link has expired or was already used. Request a new one.",
  "password-too-short": `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
  "password-too-long": "Password is too long.",
  "password-requirements-not-met":
    "Password must include uppercase, lowercase, number, and symbol characters.",
  "password-confirmation-mismatch": "Passwords do not match.",
  "reset-failed": "Password reset failed. Please retry or request a new link.",
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

function mapTokenErrorToPageError(error: string): string {
  switch (error) {
    case "token-expired":
      return "expired-reset-link";
    default:
      return "invalid-reset-link";
  }
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const token = readQueryValue(searchParams?.token) ?? "";
  const explicitErrorCode = readQueryValue(searchParams?.error);
  const tokenValidationResult = token
    ? await validatePasswordResetToken(token)
    : { ok: false as const, status: 400, error: "invalid-token" };

  const implicitTokenErrorCode = tokenValidationResult.ok
    ? null
    : mapTokenErrorToPageError(tokenValidationResult.error);

  const errorCode = explicitErrorCode ?? implicitTokenErrorCode;
  const errorMessage =
    errorCode && ERROR_MESSAGES[errorCode] ? ERROR_MESSAGES[errorCode] : null;
  const canSubmitForm = tokenValidationResult.ok;

  return (
    <main className="container py-16">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <Badge variant="secondary" className="w-fit">
          Password recovery
        </Badge>

        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Reset password</h1>
          <p className="text-sm text-muted-foreground">
            Set a new password for your NexusDash account.
          </p>
        </div>

        {errorMessage ? (
          <AutoDismissingAlert
            message={errorMessage}
            className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          />
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Choose a new password</CardTitle>
            <CardDescription>
              Use at least {MIN_PASSWORD_LENGTH} characters with uppercase,
              lowercase, number, and symbol.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {canSubmitForm ? (
              <form action={resetPasswordAction} className="grid gap-4">
                <input type="hidden" name="token" value={token} />
                <div className="grid gap-2">
                  <label htmlFor="reset-password" className="text-sm font-medium">
                    New password
                  </label>
                  <input
                    id="reset-password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Create a strong password"
                    required
                    minLength={MIN_PASSWORD_LENGTH}
                    maxLength={128}
                    className="h-11 rounded-md border border-input bg-background px-3 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  />
                </div>
                <div className="grid gap-2">
                  <label
                    htmlFor="reset-confirm-password"
                    className="text-sm font-medium"
                  >
                    Confirm password
                  </label>
                  <input
                    id="reset-confirm-password"
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Re-enter your password"
                    required
                    minLength={MIN_PASSWORD_LENGTH}
                    maxLength={128}
                    className="h-11 rounded-md border border-input bg-background px-3 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  />
                </div>
                <Button type="submit">Reset password</Button>
              </form>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Request a new reset link to continue.
                </p>
                <Button asChild>
                  <Link href="/forgot-password">Request new reset link</Link>
                </Button>
              </div>
            )}

            <Button asChild variant="ghost">
              <Link href="/?form=signin">Back to sign in</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
