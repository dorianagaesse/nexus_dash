import Link from "next/link";
import { Bell, Check, ExternalLink, MailPlus, RotateCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { NotificationSummary } from "@/lib/services/notification-service";

interface NotificationCenterListProps {
  notifications: NotificationSummary[];
  onMarkRead: (formData: FormData) => void | Promise<void>;
  onMarkUnread: (formData: FormData) => void | Promise<void>;
  onMarkAllRead: () => void | Promise<void>;
  onAcceptInvitation: (formData: FormData) => void | Promise<void>;
  onDeclineInvitation: (formData: FormData) => void | Promise<void>;
}

const notificationTimeFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function formatNotificationTime(value: string): string {
  return notificationTimeFormatter.format(new Date(value));
}

function getNotificationTypeLabel(notification: NotificationSummary): string {
  if (notification.type === "project_invitation") {
    return "Project invitation";
  }
  if (notification.type === "task_comment_mention") {
    return "Mentioned in comment";
  }

  return "Notification";
}

function isProjectInvitationMetadata(
  metadata: unknown,
): metadata is { projectName: string; role: string; invitedByDisplayName: string; expiresAt: string; invitationId: string } {
  return (
    typeof metadata === "object" &&
    metadata !== null &&
    "invitationId" in metadata
  );
}

export function NotificationCenterList({
  notifications,
  onMarkRead,
  onMarkUnread,
  onMarkAllRead,
  onAcceptInvitation,
  onDeclineInvitation,
}: NotificationCenterListProps) {
  const unreadCount = notifications.filter((notification) => !notification.readAt).length;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/70 px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="rounded-full border border-sky-500/30 bg-sky-500/10 p-2 text-sky-700 dark:text-sky-200">
            <Bell className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-medium">
              {unreadCount === 0
                ? "All read"
                : `${unreadCount} unread`}
            </p>
          </div>
        </div>

        <form action={onMarkAllRead}>
          <Button type="submit" variant="outline" disabled={unreadCount === 0}>
            <Check className="h-4 w-4" />
            Mark all read
          </Button>
        </form>
      </div>

      {notifications.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-5 py-8 text-sm text-muted-foreground">
          No active notifications.
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => {
            const isUnread = !notification.readAt;
            const metadata = notification.metadata;
            const isInvitation = isProjectInvitationMetadata(metadata);

            return (
              <article
                key={notification.id}
                className={
                  "rounded-xl border px-4 py-4 shadow-sm transition " +
                  (isUnread
                    ? "border-sky-500/40 bg-sky-500/10"
                    : "border-border/70 bg-card/70")
                }
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={isUnread ? "default" : "secondary"}>
                        {getNotificationTypeLabel(notification)}
                      </Badge>
                      {isUnread ? (
                        <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white">
                          Unread
                        </span>
                      ) : null}
                    </div>

                    <div className="space-y-1">
                      <h2 className="text-base font-semibold">{notification.title}</h2>
                      {notification.body ? (
                        <p className="text-sm text-muted-foreground">{notification.body}</p>
                      ) : null}
                      <p className="text-xs text-muted-foreground">
                        Received {formatNotificationTime(notification.createdAt)}
                      </p>
                    </div>

                    {isInvitation ? (
                      <dl className="grid gap-2 rounded-lg border border-border/60 bg-background/70 p-3 text-xs sm:grid-cols-2">
                        <div>
                          <dt className="font-medium text-foreground">Project</dt>
                          <dd className="text-muted-foreground">{metadata.projectName}</dd>
                        </div>
                        <div>
                          <dt className="font-medium text-foreground">Role</dt>
                          <dd className="text-muted-foreground">{metadata.role}</dd>
                        </div>
                        <div>
                          <dt className="font-medium text-foreground">Invited by</dt>
                          <dd className="text-muted-foreground">
                            {metadata.invitedByDisplayName}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-medium text-foreground">Expires</dt>
                          <dd className="text-muted-foreground">
                            {formatNotificationTime(metadata.expiresAt)}
                          </dd>
                        </div>
                      </dl>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {isInvitation ? (
                      <>
                        <form action={onAcceptInvitation}>
                          <input
                            type="hidden"
                            name="invitationId"
                            value={metadata.invitationId}
                          />
                          <Button type="submit">
                            <MailPlus className="h-4 w-4" />
                            Accept
                          </Button>
                        </form>
                        <form action={onDeclineInvitation}>
                          <input
                            type="hidden"
                            name="invitationId"
                            value={metadata.invitationId}
                          />
                          <Button type="submit" variant="outline">
                            Decline
                          </Button>
                        </form>
                      </>
                    ) : null}

                    {notification.targetPath ? (
                      <Button asChild variant="ghost">
                        <Link href={notification.targetPath}>
                          <ExternalLink className="h-4 w-4" />
                          Open
                        </Link>
                      </Button>
                    ) : null}

                    <form action={isUnread ? onMarkRead : onMarkUnread}>
                      <input
                        type="hidden"
                        name="notificationId"
                        value={notification.id}
                      />
                      <Button type="submit" variant="ghost">
                        {isUnread ? (
                          <>
                            <Check className="h-4 w-4" />
                            Mark read
                          </>
                        ) : (
                          <>
                            <RotateCcw className="h-4 w-4" />
                            Mark unread
                          </>
                        )}
                      </Button>
                    </form>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
