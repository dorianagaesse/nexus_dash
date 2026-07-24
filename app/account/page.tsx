import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";

import { AutoDismissingAlert } from "@/components/auto-dismissing-alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UserAvatar } from "@/components/ui/user-avatar";
import { requireSessionUserIdFromServer } from "@/lib/auth/server-guard";
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  MAX_USERNAME_LENGTH,
  MIN_USERNAME_LENGTH,
} from "@/lib/services/account-security-policy";
import { getAccountProfile } from "@/lib/services/account-profile-service";

import {
  regenerateAccountAvatarAction,
  updateAccountEmailAction,
  updateAccountPasswordAction,
  updateAccountUsernameAction,
} from "./actions";

type SearchParams = Record<string, string | string[] | undefined>;

export const dynamic = "force-dynamic";

const STATUS_MESSAGES: Record<string, string> = {
  "avatar-regenerated": "Avatar regenerated.",
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
  "avatar-regenerate-failed": "Could not regenerate avatar. Please retry.",
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

export default async function AccountProfilePage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  noStore();
  const actorUserId = await requireSessionUserIdFromServer();
  const resolvedSearchParams = await searchParams;

  const profileResult = await getAccountProfile(actorUserId);
  if (!profileResult.ok) {
    notFound();
  }

  const status = readQueryValue(resolvedSearchParams?.status);
  const error = readQueryValue(resolvedSearchParams?.error);
  const avatarDisplayName =
    profileResult.data.usernameTag || profileResult.data.username || "Account";

  return (
    <section aria-labelledby="account-heading">
      <div className="flex w-full flex-col gap-5">
        <div className="space-y-2">
          <h1 id="account-heading" className="text-3xl font-semibold tracking-tight">
            Account
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage your identity, email, and password.
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

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Identity</CardTitle>
            <CardDescription>
              Manage your generated avatar, public tag, and account email from one
              place.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6">
            <div className="flex flex-col gap-4 rounded-xl border border-border/70 bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <UserAvatar
                  avatarSeed={profileResult.data.avatarSeed}
                  displayName={avatarDisplayName}
                  className="h-16 w-16 border-border/80"
                />
                <div className="space-y-1">
                  <p className="text-sm font-medium">Generated avatar</p>
                  <p className="text-xs text-muted-foreground">
                    NexusDash uses a deterministic pixel avatar seeded to your
                    account. Regenerate it any time from here.
                  </p>
                </div>
              </div>
              <form action={regenerateAccountAvatarAction}>
                <Button type="submit" variant="outline" className="min-h-11">
                  Regenerate avatar
                </Button>
              </form>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
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
                      className="min-h-11 w-full rounded-md border border-input bg-background px-3 pr-24 text-sm"
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
                  <Button type="submit" className="min-h-11">Save username</Button>
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
                    className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Changing email requires verifying the new address before workspace
                    access resumes.
                  </p>
                </div>
                <div>
                  <Button type="submit" className="min-h-11">Update email</Button>
                </div>
              </form>
            </div>
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
                  className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"
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
                    className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"
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
                    className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Use at least {MIN_PASSWORD_LENGTH} characters with uppercase, lowercase,
                number, and symbol.
              </p>

              <div>
                <Button type="submit" className="min-h-11">Update password</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
