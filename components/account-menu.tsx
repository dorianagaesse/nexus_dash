"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CircleUserRound, ExternalLink, LogOut } from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";
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
  menuAlign?: "start" | "end";
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
  menuAlign = "end",
}: AccountMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
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

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    menuRef.current
      ?.querySelector<HTMLElement>('[role="menuitem"]')
      ?.focus();
  }, [isOpen, menuRef]);

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        '[role="menuitem"]:not([disabled])'
      )
    );
    const currentIndex = items.findIndex((item) => item === document.activeElement);
    let nextIndex: number | null = null;

    if (event.key === "ArrowDown") {
      nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
    } else if (event.key === "ArrowUp") {
      nextIndex =
        currentIndex < 0
          ? items.length - 1
          : (currentIndex - 1 + items.length) % items.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = items.length - 1;
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setIsOpen(false);
      triggerRef.current?.focus();
      return;
    }

    if (nextIndex !== null && items[nextIndex]) {
      event.preventDefault();
      items[nextIndex].focus();
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div ref={menuRef} className="relative">
      <Button
        ref={triggerRef}
        type="button"
        variant="outline"
        size="icon"
        aria-label={`Account menu${
          unreadNotificationCount > 0
            ? `, ${unreadNotificationCount} unread notifications`
            : ""
        }`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((previous) => !previous)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setIsOpen(true);
          }
        }}
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
          <>
            <span
              aria-hidden="true"
              className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-background"
            />
            <span className="sr-only">
              {unreadNotificationCount} unread notifications
            </span>
          </>
        ) : null}
      </Button>
      {isOpen ? (
        <div
          role="menu"
          aria-label="Account actions"
          onKeyDown={handleMenuKeyDown}
          className={cn(
            "absolute z-[var(--layer-menu)] w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-border/70 bg-background p-1.5 shadow-lg",
            menuAlign === "start" ? "left-0" : "right-0",
            menuPlacement === "top" ? "bottom-full mb-2" : "top-full mt-2"
          )}
        >
          {displayName ? (
            <div role="none" className="border-b border-border/70 px-3 py-3">
              <div className="flex items-center gap-3">
                {avatarSeed ? (
                  <UserAvatar
                    avatarSeed={avatarSeed}
                    displayName={displayName}
                    className="h-10 w-10 border-border/80"
                  />
                ) : null}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{displayName}</p>
                  {usernameTag ? (
                    <p className="truncate text-[11px] text-muted-foreground">
                      {usernameTag}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            className="mt-1 min-h-12 w-full justify-start px-3"
            asChild
          >
            <Link role="menuitem" href={accountHref} onClick={() => setIsOpen(false)}>
              <CircleUserRound className="h-5 w-5" aria-hidden />
              <span className="min-w-0 text-left">
                <span className="block text-sm font-medium">Your account</span>
                <span className="block truncate text-[11px] font-normal text-muted-foreground">
                  Profile, settings &amp; notifications
                </span>
              </span>
              {unreadNotificationCount > 0 ? (
                <span className="ml-auto rounded-full bg-destructive px-2 py-0.5 text-[10px] font-semibold text-destructive-foreground">
                  <span className="sr-only">Unread notifications: </span>
                  {unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}
                </span>
              ) : null}
            </Link>
          </Button>
          <div role="none" className="mt-1 border-t border-border/70 px-2 py-2">
            <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
              Appearance
            </p>
            <ThemeToggle
              role="menuitem"
              className="w-full justify-start border-transparent bg-transparent px-2 text-muted-foreground shadow-none hover:text-foreground"
            />
          </div>
          {appMetadata ? (
            <div role="none" className="border-t border-border/70 px-3 py-2 text-xs text-muted-foreground">
              <div className="flex items-center justify-between gap-3">
                <span title={appMetadata.diagnosticLabel} className="font-mono">
                  {appMetadata.versionLabel}
                </span>
                <Link
                  role="menuitem"
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
          <form
            action="/api/auth/logout"
            method="post"
            role="none"
            className="border-t border-border/70 pt-1"
          >
            <Button
              role="menuitem"
              type="submit"
              variant="ghost"
              className="min-h-11 w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              Log out
            </Button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
