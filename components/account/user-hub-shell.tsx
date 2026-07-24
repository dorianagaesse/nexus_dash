"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { Bell, CircleUserRound, SlidersHorizontal } from "lucide-react";

import { ContextualReturnLink } from "@/components/contextual-return-link";
import { UserAvatar } from "@/components/ui/user-avatar";
import {
  buildAuthenticatedDestinationHref,
  isDestinationCurrent,
  type AuthenticatedDestination,
} from "@/lib/navigation/authenticated-shell";
import { useNotificationRealtimeSnapshot } from "@/lib/notification-realtime-client";
import type { NotificationRealtimeSnapshot } from "@/lib/notification-realtime-types";
import { cn } from "@/lib/utils";

const USER_HUB_DESTINATIONS: Array<{
  href: AuthenticatedDestination;
  label: string;
  icon: typeof CircleUserRound;
}> = [
  { href: "/account", label: "Account", icon: CircleUserRound },
  { href: "/account/settings", label: "Settings", icon: SlidersHorizontal },
  { href: "/account/notifications", label: "Notifications", icon: Bell },
];

interface UserHubShellProps {
  displayName: string;
  usernameTag: string | null;
  avatarSeed: string;
  initialNotificationSnapshot: NotificationRealtimeSnapshot;
  children: ReactNode;
}

export function UserHubShell({
  displayName,
  usernameTag,
  avatarSeed,
  initialNotificationSnapshot,
  children,
}: UserHubShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const notificationSnapshot = useNotificationRealtimeSnapshot(
    initialNotificationSnapshot
  );
  const query = searchParams.toString();
  const currentPath = `${pathname}${query ? `?${query}` : ""}`;
  const returnTo = searchParams.get("returnTo");

  return (
    <div className="container py-5 sm:py-8">
      <div className="mx-auto w-full max-w-5xl">
        <header className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
          <div className="space-y-4 p-4 sm:p-6">
            <ContextualReturnLink
              returnTo={returnTo}
              fallback={{ href: "/projects", label: "Projects" }}
            />

            <div className="flex min-w-0 items-center gap-3 sm:gap-4">
              <UserAvatar
                avatarSeed={avatarSeed}
                displayName={usernameTag ?? displayName}
                className="h-12 w-12 shrink-0 border-border/80 sm:h-14 sm:w-14"
              />
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  User hub
                </p>
                <p className="truncate text-xl font-semibold tracking-tight sm:text-2xl">
                  Your space
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {usernameTag ?? displayName}
                </p>
              </div>
            </div>
          </div>

          <nav
            aria-label="User hub navigation"
            className="grid grid-cols-3 border-t border-border/70 bg-muted/25 p-1.5 sm:p-2"
          >
            {USER_HUB_DESTINATIONS.map((destination) => {
              const Icon = destination.icon;
              const isCurrent = isDestinationCurrent(pathname, destination.href);
              const unreadCount =
                destination.href === "/account/notifications"
                  ? notificationSnapshot.unreadCount
                  : 0;

              return (
                <Link
                  key={destination.href}
                  href={buildAuthenticatedDestinationHref(
                    destination.href,
                    currentPath
                  )}
                  aria-current={isCurrent ? "page" : undefined}
                  className={cn(
                    "relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl border border-transparent px-1.5 py-2 text-xs font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:min-h-12 sm:flex-row sm:gap-2 sm:px-4 sm:text-sm",
                    isCurrent
                      ? "border-border/80 bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-background/70 hover:text-foreground"
                  )}
                >
                  <span className="relative grid h-5 w-5 shrink-0 place-items-center">
                    <Icon
                      className="h-[18px] w-[18px]"
                      strokeWidth={isCurrent ? 2.25 : 1.8}
                      aria-hidden
                    />
                    {unreadCount > 0 ? (
                      <span className="absolute -right-2 -top-2 grid min-h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[9px] font-bold leading-none text-destructive-foreground ring-2 ring-background">
                        <span className="sr-only">
                          {unreadCount} unread notifications
                        </span>
                        <span aria-hidden>
                          {unreadCount > 99 ? "99+" : unreadCount}
                        </span>
                      </span>
                    ) : null}
                  </span>
                  <span className="max-w-full truncate">{destination.label}</span>
                  {isCurrent ? (
                    <span
                      aria-hidden
                      className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary sm:inset-x-6"
                    />
                  ) : null}
                </Link>
              );
            })}
          </nav>
        </header>

        <div className="mt-6 min-w-0 sm:mt-8">{children}</div>
      </div>
    </div>
  );
}
