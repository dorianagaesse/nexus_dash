import Link from "next/link";
import { redirect } from "next/navigation";

import { AutoDismissingAlert } from "@/components/auto-dismissing-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSessionUserIdFromServer } from "@/lib/auth/session-user";
import { normalizeReturnToPath } from "@/lib/navigation/return-to";
import { EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS } from "@/lib/services/email-verification-service";
import { getEmailVerificationStatus } from "@/lib/services/email-verification-service";

import {
  continueAfterVerificationAction,
  resendVerificationEmailAction,
} from "./actions";

type SearchParams = Record<string, string | string[] | undefined>;

const STATUS_MESSAGES: Record<string, string> = {
  "verification-required": "Verify your email to continue to your workspace.",
  "verification-email-sent":
    "Verification link sent. Check your inbox and spam folder.",
  "verification-email-queued":
    "Email delivery is disabled in this environment. Verification email will be sent in production.",
  "resend-sent": "A new verification link was sent.",
  "resend-queued":
    "Email delivery is disabled in this environment. Delivery remains production-only.",
};

const ERROR_MESSAGES: Record<string, string> = {
  "invalid-verification-link":
    "This verification link is invalid. Request a new one below.",
  "expired-verification-link":
    "This verification link has expired. Request a new one below.",
  "resend-cooldown": `Please wait about ${EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS} seconds before requesting another email.`,
  "resend-limit-reached":
    "You reached the resend limit for today. Please try again tomorrow.",
  "verification-email-send-failed":
    "Could not send verification email right now. Please retry shortly.",
  "verification-pending":
    "Your email is not verified yet. Open the link from your inbox, then continue.",
  "verification-link-account-mismatch":
    "This link belongs to a different account. Sign out and verify with the matching account.",
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

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const actorUserId = await getSessionUserIdFromServer();
  const returnToPath = normalizeReturnToPath(
    readQueryValue(resolvedSearchParams?.returnTo),
    "/projects"
  );
  if (!actorUserId) {
    redirect(`/?form=signin&returnTo=${encodeURIComponent(returnToPath)}`);
  }

  const verificationStatus = await getEmailVerificationStatus(actorUserId);
  if (!verificationStatus.ok) {
    redirect(`/?form=signin&returnTo=${encodeURIComponent(returnToPath)}`);
  }

  if (verificationStatus.data.isVerified) {
    redirect(returnToPath);
  }

  const statusCode = readQueryValue(resolvedSearchParams?.status);
  const errorCode = readQueryValue(resolvedSearchParams?.error);
  const statusMessage =
    statusCode && STATUS_MESSAGES[statusCode] ? STATUS_MESSAGES[statusCode] : null;
  const errorMessage =
    errorCode && ERROR_MESSAGES[errorCode] ? ERROR_MESSAGES[errorCode] : null;

  return (
    <main className="container py-16">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <Badge variant="secondary" className="w-fit">
          Email verification
        </Badge>

        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Verify your email</h1>
          <p className="text-sm text-muted-foreground">
            We sent a verification link to{" "}
            <span className="font-medium text-foreground">
              {verificationStatus.data.email ?? "your email address"}
            </span>
            . Open the link to unlock your workspace.
          </p>
        </div>

        {statusMessage ? (
          <AutoDismissingAlert
            message={statusMessage}
            className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-200"
          />
        ) : null}

        {errorMessage ? (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {errorMessage}
          </div>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Next step</CardTitle>
            <CardDescription>
              After clicking the verification link from your inbox, continue to your
              dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <form action={continueAfterVerificationAction}>
              <input type="hidden" name="returnTo" value={returnToPath} />
              <Button type="submit">I verified, continue</Button>
            </form>
            <form action={resendVerificationEmailAction}>
              <input type="hidden" name="returnTo" value={returnToPath} />
              <Button type="submit" variant="secondary">
                Resend verification email
              </Button>
            </form>
            <Button asChild variant="ghost">
              <Link href="/">Back to home</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
