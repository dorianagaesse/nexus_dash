import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";
import { ArrowLeft, Settings } from "lucide-react";

import { AutoDismissingAlert } from "@/components/auto-dismissing-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSessionUserIdFromServer } from "@/lib/auth/server-guard";
import { logServerError } from "@/lib/observability/logger";
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  MAX_USERNAME_LENGTH,
  MIN_USERNAME_LENGTH,
} from "@/lib/services/account-security-policy";
import { getAccountProfile } from "@/lib/services/account-profile-service";
import {
  listPendingProjectInvitationsForUser,
  type ProjectInvitationSummary,
} from "@/lib/services/project-collaboration-service";

import {
  acceptProjectInvitationAction,
  declineProjectInvitationAction,
  updateAccountEmailAction,
  updateAccountPasswordAction,
  updateAccountUsernameAction,
} from "./actions";

type SearchParams = Record<string, string | string[] | undefined>;

export const dynamic = "force-dynamic";

const STATUS_MESSAGES: Record<string, string> = {
  "username-updated": "Username updated.",
  "username-updated-regenerated":
    "Username updated. Discriminator changed to keep your tag unique.",
  "email-unchanged": "Email unchanged.",
  "password-updated": "Password updated. Other active sessions were revoked.",
  "invitation-accepted": "Project invitation accepted.",
  "invitation-declined": "Project invitation declined.",
};

const ERROR_MESSAGES: Record<string, string> = {
  unauthorized: "You must be signed in to manage account profile.",
  forbidden: "You cannot update another user profile.",
  "invalid-email": "Email address is invalid.",
  "email-in-use": "This email is already used by another account.",
  "invalid-username":
    `Username must be ${MIN_USERNAME_LENGTH}-${MAX_USERNAME_LENGTH} lowercase characters using letters, numbers, dots, or underscores.`,
  "username-in-use": "Could not update username with a unique tag. Please retry.",
  "invalid-current-password": "Current password is incorrect.",
  "password-too-short": `New password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
  "password-too-long": "New password is too long.",
  "password-requirements-not-met":
    "New password must include uppercase, lowercase, number, and symbol.",
  "password-confirmation-mismatch": "New password and confirmation do not match.",
  "username-update-failed": "Could not update username. Please retry.",
  "email-update-failed": "Could not update email. Please retry.",
  "password-update-failed": "Could not update password. Please retry.",
  "invitation-not-found": "Invitation not found.",
  "invitation-revoked": "This invitation is no longer available.",
  "invitation-expired": "This invitation has expired.",
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

export default async function AccountProfilePage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  noStore();
  const actorUserId = await requireSessionUserIdFromServer();

  const profileResult = await getAccountProfile(actorUserId);
  if (!profileResult.ok) {
    notFound();
  }
  let pendingInvitations: ProjectInvitationSummary[] = [];
  try {
    const invitationsResult = await listPendingProjectInvitationsForUser(actorUserId);
    pendingInvitations = invitationsResult.ok ? invitationsResult.data.invitations : [];
  } catch (error) {
    logServerError("AccountProfilePage.listPendingProjectInvitationsForUser", error);
  }

  const status = readQueryValue(searchParams?.status);
  const error = readQueryValue(searchParams?.error);

  return (
    <main className="container py-12">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button asChild variant="ghost" className="-ml-2 w-fit px-2 text-sm">
            <Link href="/projects">
              <ArrowLeft className="h-4 w-4" />
              Back to projects
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="rounded-full border-border/60 px-3 py-1.5 text-sm font-medium text-muted-foreground hover:border-border hover:text-foreground"
          >
            <Link href="/account/settings" className="inline-flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Settings
            </Link>
          </Button>
        </div>
        <Badge variant="secondary" className="w-fit">
          Account profile
        </Badge>
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Account</h1>
          <p className="text-sm text-muted-foreground">
            Manage your identity, email, password, and invitations.
          </p>
        </div>

        {status && STATUS_MESSAGES[status] ? (
          <AutoDismissingAlert
            message={STATUS_MESSAGES[status]}
            className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-200"
          />
        ) : null}

        {error && ERROR_MESSAGES[error] ? (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {ERROR_MESSAGES[error]}
          </div>
        ) : null}

        <Card id="project-invitations">
          <CardHeader>
            <CardTitle className="text-xl">Invitations</CardTitle>
            <CardDescription>
              Review pending project invitations sent to your account.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {pendingInvitations.length === 0 ? (
              <div className="rounded-md border border-dashed border-border/60 bg-muted/20 px-4 py-5 text-sm text-muted-foreground">
                No pending invitations.
              </div>
            ) : (
              <div className="space-y-3">
                {pendingInvitations.map((invitation) => {
                  const invitationCopy =
                    invitation.role === "viewer"
                      ? `${invitation.invitedByDisplayName} invited you to view project ${invitation.projectName}.`
                      : `${invitation.invitedByDisplayName} invited you to collaborate on project ${invitation.projectName}.`;

                  return (
                    <div
                      key={invitation.invitationId}
                      className="rounded-xl border border-border/70 bg-card/70 px-4 py-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="text-sm font-medium">{invitationCopy}</p>
                          <p className="text-xs text-muted-foreground">
                            Role: {invitation.role} · Expires{" "}
                            {new Date(invitation.expiresAt).toLocaleString()}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <form action={acceptProjectInvitationAction}>
                            <input
                              type="hidden"
                              name="invitationId"
                              value={invitation.invitationId}
                            />
                            <Button type="submit">Accept</Button>
                          </form>
                          <form action={declineProjectInvitationAction}>
                            <input
                              type="hidden"
                              name="invitationId"
                              value={invitation.invitationId}
                            />
                            <Button type="submit" variant="outline">
                              Decline
                            </Button>
                          </form>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Identity</CardTitle>
            <CardDescription>
              Update your public tag and account email from one place.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-2">
            <form action={updateAccountUsernameAction} className="grid gap-4">
              <div className="space-y-1">
                <h2 className="text-base font-medium">Username</h2>
                <p className="text-xs text-muted-foreground">
                  {profileResult.data.usernameTag ? (
                    <>
                      Current tag: <code>{profileResult.data.usernameTag}</code>
                    </>
                  ) : (
                    "No public tag assigned yet."
                  )}
                </p>
              </div>
              <div className="grid gap-2">
                <label htmlFor="account-username" className="text-sm font-medium">
                  Username
                </label>
                <div className="relative">
                  <input
                    id="account-username"
                    name="username"
                    type="text"
                    defaultValue={profileResult.data.username}
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    required
                    minLength={MIN_USERNAME_LENGTH}
                    maxLength={MAX_USERNAME_LENGTH}
                    pattern="[A-Za-z0-9._]+"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 pr-24 text-sm"
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground select-none">
                    #{profileResult.data.usernameDiscriminator ?? "pending"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Use {MIN_USERNAME_LENGTH}-{MAX_USERNAME_LENGTH} letters, numbers,
                  dots, or underscores. Uppercase input is normalized to lowercase.
                </p>
              </div>
              <div>
                <Button type="submit">Save username</Button>
              </div>
            </form>

            <form action={updateAccountEmailAction} className="grid gap-4">
              <div className="space-y-1">
                <h2 className="text-base font-medium">Email</h2>
                <p className="text-xs text-muted-foreground">
                  {profileResult.data.isEmailVerified
                    ? "Verified email on file."
                    : "Email pending verification."}
                </p>
              </div>
              <div className="grid gap-2">
                <label htmlFor="account-email" className="text-sm font-medium">
                  Email address
                </label>
                <input
                  id="account-email"
                  name="email"
                  type="email"
                  defaultValue={profileResult.data.email ?? ""}
                  autoComplete="email"
                  required
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Changing email requires verifying the new address before workspace
                  access resumes.
                </p>
              </div>
              <div>
                <Button type="submit">Update email</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Password</CardTitle>
            <CardDescription>
              Change your password. Other sessions will be signed out.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={updateAccountPasswordAction} className="grid gap-4">
              <div className="grid gap-2">
                <label htmlFor="account-current-password" className="text-sm font-medium">
                  Current password
                </label>
                <input
                  id="account-current-password"
                  name="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  maxLength={MAX_PASSWORD_LENGTH}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <label htmlFor="account-new-password" className="text-sm font-medium">
                    New password
                  </label>
                  <input
                    id="account-new-password"
                    name="newPassword"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={MIN_PASSWORD_LENGTH}
                    maxLength={MAX_PASSWORD_LENGTH}
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  />
                </div>

                <div className="grid gap-2">
                  <label
                    htmlFor="account-confirm-new-password"
                    className="text-sm font-medium"
                  >
                    Confirm new password
                  </label>
                  <input
                    id="account-confirm-new-password"
                    name="confirmNewPassword"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={MIN_PASSWORD_LENGTH}
                    maxLength={MAX_PASSWORD_LENGTH}
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Use at least {MIN_PASSWORD_LENGTH} characters with uppercase, lowercase,
                number, and symbol.
              </p>

              <div>
                <Button type="submit">Update password</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
