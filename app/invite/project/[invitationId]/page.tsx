import Link from "next/link";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSessionUserIdFromServer } from "@/lib/auth/session-user";
import { appendQueryToPath } from "@/lib/navigation/return-to";
import {
  buildProjectInvitationReturnToPath,
  getProjectInvitationRecipientView,
} from "@/lib/services/project-collaboration-service";

import {
  acceptProjectInvitationFromLinkAction,
  declineProjectInvitationFromLinkAction,
} from "./actions";

type SearchParams = Record<string, string | string[] | undefined>;

const ERROR_MESSAGES: Record<string, string> = {
  "invitation-not-found": "This invitation could not be found.",
  "invitation-revoked": "This invitation is no longer available.",
  "invitation-expired": "This invitation has expired.",
  "invitation-replaced": "This invitation was replaced by a newer link.",
  "invitation-email-mismatch":
    "This invitation belongs to a different verified email address.",
  "invitation-already-accepted": "This invitation was already accepted.",
  "invitation-accept-failed": "Could not accept the invitation. Please retry.",
  "invitation-decline-failed": "Could not decline the invitation. Please retry.",
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

export default async function ProjectInvitationPage({
  params,
  searchParams,
}: {
  params: { invitationId: string };
  searchParams?: SearchParams;
}) {
  const actorUserId = await getSessionUserIdFromServer();
  const invitationPath = buildProjectInvitationReturnToPath(params.invitationId);
  const view = await getProjectInvitationRecipientView({
    invitationId: params.invitationId,
    actorUserId,
  });
  const errorCode = readQueryValue(searchParams?.error);
  const errorMessage =
    errorCode && ERROR_MESSAGES[errorCode] ? ERROR_MESSAGES[errorCode] : null;

  if (!view.invitation && view.state === "not-found") {
    return (
      <main className="container py-16">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
          <Badge variant="secondary" className="w-fit">
            Project invitation
          </Badge>
          <Card>
            <CardHeader>
              <CardTitle>Invitation unavailable</CardTitle>
              <CardDescription>
                This project invitation could not be found.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href="/?form=signin">Back to sign in</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  const invitation = view.invitation;
  if (!invitation) {
    redirect("/?form=signin");
  }

  const signInHref = `/?form=signin&email=${encodeURIComponent(
    invitation.invitedEmail
  )}&returnTo=${encodeURIComponent(invitationPath)}`;
  const signUpHref = `/?form=signup&email=${encodeURIComponent(
    invitation.invitedEmail
  )}&returnTo=${encodeURIComponent(invitationPath)}`;
  const verifyHref = `/verify-email?returnTo=${encodeURIComponent(invitationPath)}`;
  const logoutAction = `/api/auth/logout?returnTo=${encodeURIComponent(invitationPath)}`;
  const roleCopy =
    invitation.role === "viewer"
      ? "Read-only project access"
      : "Can edit project content after joining";

  return (
    <main className="container py-16">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <Badge variant="secondary" className="w-fit">
          Project invitation
        </Badge>

        {errorMessage ? (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {errorMessage}
          </div>
        ) : null}

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>{invitation.projectName}</CardTitle>
              <Badge variant="outline" className="capitalize">
                {invitation.role}
              </Badge>
            </div>
            <CardDescription>
              {invitation.invitedByDisplayName} invited{" "}
              <span className="font-medium text-foreground">{invitation.invitedEmail}</span>{" "}
              to this project.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>{roleCopy}</p>
              <p>Expires {new Date(invitation.expiresAt).toLocaleString()}.</p>
            </div>

            {view.state === "sign-in-required" ? (
              <div className="flex flex-wrap items-center gap-3">
                <Button asChild>
                  <Link href={signInHref}>Sign in</Link>
                </Button>
                <Button asChild variant="secondary">
                  <Link href={signUpHref}>Create account</Link>
                </Button>
              </div>
            ) : null}

            {view.state === "wrong-account" ? (
              <div className="space-y-3">
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-100">
                  You are signed in as {view.actor?.email ?? "another account"}, but this
                  invite is reserved for {invitation.invitedEmail}.
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <form action={logoutAction} method="post">
                    <Button type="submit">Sign out and switch account</Button>
                  </form>
                  <Button asChild variant="outline">
                    <Link href={signInHref}>Use matching account</Link>
                  </Button>
                </div>
              </div>
            ) : null}

            {view.state === "verification-required" ? (
              <div className="space-y-3">
                <div className="rounded-md border border-sky-500/40 bg-sky-500/10 px-4 py-3 text-sm text-sky-800 dark:text-sky-100">
                  Verify {invitation.invitedEmail} before accepting this invitation.
                </div>
                <Button asChild>
                  <Link href={verifyHref}>Verify email</Link>
                </Button>
              </div>
            ) : null}

            {view.state === "accept-ready" ? (
              <div className="flex flex-wrap items-center gap-3">
                <form action={acceptProjectInvitationFromLinkAction}>
                  <input type="hidden" name="invitationId" value={invitation.invitationId} />
                  <Button type="submit">Accept invitation</Button>
                </form>
                <form action={declineProjectInvitationFromLinkAction}>
                  <input type="hidden" name="invitationId" value={invitation.invitationId} />
                  <Button type="submit" variant="outline">
                    Decline
                  </Button>
                </form>
              </div>
            ) : null}

            {view.state === "accepted" ? (
              <Button asChild>
                <Link
                  href={appendQueryToPath(`/projects/${invitation.projectId}`, {
                    status: "invitation-accepted",
                  })}
                >
                  Open project
                </Link>
              </Button>
            ) : null}

            {view.state === "revoked" || view.state === "expired" || view.state === "replaced" ? (
              <Button asChild variant="outline">
                <Link href="/?form=signin">Back to sign in</Link>
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
