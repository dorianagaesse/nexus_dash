import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { ArrowLeft } from "lucide-react";

import { NotificationCenterList } from "@/components/account/notification-center-list";
import { AutoDismissingAlert } from "@/components/auto-dismissing-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireVerifiedSessionUserIdFromServer } from "@/lib/auth/server-guard";
import { logServerError } from "@/lib/observability/logger";
import {
  listNotificationsForUser,
  type NotificationSummary,
} from "@/lib/services/notification-service";

import {
  acceptNotificationInvitationAction,
  declineNotificationInvitationAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
  markNotificationUnreadAction,
} from "./actions";

type SearchParams = Record<string, string | string[] | undefined>;

export const dynamic = "force-dynamic";

const STATUS_MESSAGES: Record<string, string> = {
  "notification-read": "Notification marked read.",
  "notification-unread": "Notification marked unread.",
  "notifications-read": "Visible notifications marked read.",
  "invitation-accepted": "Project invitation accepted.",
  "invitation-declined": "Project invitation declined.",
};

const ERROR_MESSAGES: Record<string, string> = {
  unauthorized: "You must be signed in to manage notifications.",
  "notification-required": "Notification not found.",
  "notification-not-found": "Notification not found.",
  "notification-update-failed": "Could not update notification. Please retry.",
  "invitation-not-found": "Invitation not found.",
  "invitation-revoked": "This invitation is no longer available.",
  "invitation-expired": "This invitation has expired.",
  "invitation-replaced": "This invitation was replaced by a newer invite.",
  "invitation-email-mismatch":
    "This invitation belongs to a different verified email address.",
  "invitation-already-accepted": "This invitation was already accepted.",
  "invitation-accept-failed": "Could not accept the invitation. Please retry.",
  "invitation-decline-failed": "Could not decline the invitation. Please retry.",
  "notifications-list-failed": "Could not load notifications. Please retry.",
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

export default async function AccountNotificationsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  noStore();
  const actorUserId = await requireVerifiedSessionUserIdFromServer();
  const resolvedSearchParams = await searchParams;
  const status = readQueryValue(resolvedSearchParams?.status);
  const error = readQueryValue(resolvedSearchParams?.error);

  let notifications: NotificationSummary[] = [];
  let listError: string | null = null;
  try {
    const result = await listNotificationsForUser(actorUserId);
    if (result.ok) {
      notifications = result.data.notifications;
    } else {
      listError = result.error;
    }
  } catch (loadError) {
    logServerError("AccountNotificationsPage.listNotificationsForUser", loadError);
    listError = "notifications-list-failed";
  }

  const visibleError = error ?? listError;

  return (
    <main className="container py-12">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <Button asChild variant="ghost" className="-ml-2 w-fit px-2 text-sm">
          <Link href="/account">
            <ArrowLeft className="h-4 w-4" />
            Back to account
          </Link>
        </Button>

        <Badge variant="secondary" className="w-fit">
          Notifications
        </Badge>

        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            Notifications
          </h1>
        </div>

        {status && STATUS_MESSAGES[status] ? (
          <AutoDismissingAlert
            message={STATUS_MESSAGES[status]}
            className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-200"
          />
        ) : null}

        {visibleError && ERROR_MESSAGES[visibleError] ? (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {ERROR_MESSAGES[visibleError]}
          </div>
        ) : null}

        <NotificationCenterList
          notifications={notifications}
          onMarkRead={markNotificationReadAction}
          onMarkUnread={markNotificationUnreadAction}
          onMarkAllRead={markAllNotificationsReadAction}
          onAcceptInvitation={acceptNotificationInvitationAction}
          onDeclineInvitation={declineNotificationInvitationAction}
        />
      </div>
    </main>
  );
}
