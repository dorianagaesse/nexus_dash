"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Bell, CircleUserRound, ExternalLink, LogOut, Settings } from "lucide-react";

import { UserAvatar } from "@/components/ui/user-avatar";
import { Button } from "@/components/ui/button";
import { useDismissibleMenu } from "@/lib/hooks/use-dismissible-menu";
import { useNotificationRealtimeSnapshot } from "@/lib/notification-realtime-client";
import type { AppMetadataSummary } from "@/lib/app-metadata";
import { buildAuthenticatedDestinationHref } from "@/lib/navigation/authenticated-shell";
import { cn } from "@/lib/utils";

interface AccountMenuProps {
  isAuthenticated: boolean;
  displayName: string | null;
  usernameTag: string | null;
  avatarSeed: string | null;
  initialUnreadNotificationCount: number;
  currentPath?: string;
  appMetadata?: AppMetadataSummary;
  menuPlacement?: "top" | "bottom";
}

export function AccountMenu({
  isAuthenticated,
  displayName,
  usernameTag,
  avatarSeed,
  initialUnreadNotificationCount,
  currentPath = "/projects",
  appMetadata,
  menuPlacement = "bottom",
}: AccountMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useDismissibleMenu<HTMLDivElement>(isOpen, () => setIsOpen(false));
  const initialNotificationSnapshot = useMemo(
    () => ({
      version: new Date(0).toISOString(),
      unreadCount: initialUnreadNotificationCount,
      latestUnreadNotification: null,
      serverTime: new Date().toISOString(),
    }),
    [initialUnreadNotificationCount]
  );
  const notificationSnapshot = useNotificationRealtimeSnapshot(
    initialNotificationSnapshot
  );
  const unreadNotificationCount = notificationSnapshot.unreadCount;
  const accountHref = buildAuthenticatedDestinationHref("/account", currentPath);
  const settingsHref = buildAuthenticatedDestinationHref(
    "/account/settings",
    currentPath
  );
  const notificationsHref = buildAuthenticatedDestinationHref(
    "/account/notifications",
    currentPath
  );

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div ref={menuRef} className="relative">
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((previous) => !previous)}
        className="relative min-h-11 min-w-11 overflow-hidden rounded-full p-0"
      >
        {avatarSeed && displayName ? (
          <UserAvatar
            avatarSeed={avatarSeed}
            displayName={displayName}
            className="h-full w-full border-none"
            decorative
          />
        ) : (
          <CircleUserRound className="h-5 w-5" />
        )}
        {unreadNotificationCount > 0 ? (
          <span
            aria-hidden="true"
            className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-background"
          />
        ) : null}
      </Button>
      {isOpen ? (
        <div
          className={cn(
            "absolute right-0 z-[var(--layer-menu)] w-64 rounded-xl border border-border/70 bg-background p-1.5 shadow-lg",
            menuPlacement === "top" ? "bottom-full mb-2" : "top-full mt-2"
          )}
        >
          {displayName ? (
            <div className="border-b border-border/70 px-3 py-2">
              <div className="flex items-center gap-3">
                {avatarSeed ? (
                  <UserAvatar
                    avatarSeed={avatarSeed}
                    displayName={displayName}
                    className="h-10 w-10 border-border/80"
                  />
                ) : null}
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium">Welcome {displayName}!</p>
                  {usernameTag ? (
                    <p className="truncate text-[11px] text-muted-foreground">
                      {usernameTag}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
          <Button type="button" variant="ghost" className="min-h-11 w-full justify-start" asChild>
            <Link href={accountHref} onClick={() => setIsOpen(false)}>
              <CircleUserRound className="h-4 w-4" />
              Account
            </Link>
          </Button>
          <Button type="button" variant="ghost" className="min-h-11 w-full justify-start" asChild>
            <Link href={settingsHref} onClick={() => setIsOpen(false)}>
              <Settings className="h-4 w-4" />
              Settings
            </Link>
          </Button>
          <Button type="button" variant="ghost" className="min-h-11 w-full justify-start" asChild>
            <Link href={notificationsHref} onClick={() => setIsOpen(false)}>
              <Bell className="h-4 w-4" />
              Notifications
              {unreadNotificationCount > 0 ? (
                <span className="ml-auto rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-medium text-white">
                  {unreadNotificationCount}
                </span>
              ) : null}
            </Link>
          </Button>
          {appMetadata ? (
            <div className="mt-1 border-t border-border/70 px-3 py-2 text-xs text-muted-foreground">
              <div className="flex items-center justify-between gap-3">
                <span title={appMetadata.diagnosticLabel} className="font-mono">
                  {appMetadata.versionLabel}
                </span>
                <Link
                  href={appMetadata.repositoryUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 font-medium hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => setIsOpen(false)}
                >
                  Repository
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </div>
            </div>
          ) : null}
          <form action="/api/auth/logout" method="post">
            <Button type="submit" variant="ghost" className="min-h-11 w-full justify-start">
              <LogOut className="h-4 w-4" />
              Log out
            </Button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
