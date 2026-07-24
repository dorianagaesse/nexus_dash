"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  ChevronUp,
  CircleUserRound,
  LogOut,
  Settings,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useDismissibleMenu } from "@/lib/hooks/use-dismissible-menu";
import { buildAuthenticatedDestinationHref } from "@/lib/navigation/authenticated-shell";
import { useNotificationRealtimeSnapshot } from "@/lib/notification-realtime-client";
import { cn } from "@/lib/utils";

interface AccountMenuProps {
  isAuthenticated: boolean;
  displayName: string | null;
  usernameTag: string | null;
  avatarSeed: string | null;
  initialUnreadNotificationCount: number;
  currentPath?: string;
  menuPlacement?: "top" | "bottom";
  menuAlign?: "start" | "end";
  triggerVariant?: "avatar" | "identity";
}

export function AccountMenu({
  isAuthenticated,
  displayName,
  usernameTag,
  avatarSeed,
  initialUnreadNotificationCount,
  currentPath = "/projects",
  menuPlacement = "bottom",
  menuAlign = "end",
  triggerVariant = "avatar",
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
  const settingsHref = buildAuthenticatedDestinationHref(
    "/account/settings",
    currentPath
  );
  const notificationsHref = buildAuthenticatedDestinationHref(
    "/account/notifications",
    currentPath
  );

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

  const unreadLabel =
    unreadNotificationCount > 0
      ? `, ${unreadNotificationCount} unread notifications`
      : "";
  const avatar = (
    <span className="relative h-11 w-11 shrink-0">
      {avatarSeed && displayName ? (
        <UserAvatar
          avatarSeed={avatarSeed}
          displayName={displayName}
          className="h-11 w-11 border-border/80"
          decorative
        />
      ) : (
        <span className="grid h-11 w-11 place-items-center rounded-full border border-border/80 bg-background">
          <CircleUserRound className="h-5 w-5" aria-hidden />
        </span>
      )}
      {unreadNotificationCount > 0 ? (
        <>
          <span
            aria-hidden="true"
            className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-background"
          />
          <span className="sr-only">
            {unreadNotificationCount} unread notifications
          </span>
        </>
      ) : null}
    </span>
  );

  return (
    <div
      ref={menuRef}
      className={cn("relative", triggerVariant === "identity" && "w-full")}
    >
      <Button
        ref={triggerRef}
        type="button"
        variant={triggerVariant === "identity" ? "ghost" : "outline"}
        size={triggerVariant === "identity" ? "default" : "icon"}
        aria-label={`Account menu${unreadLabel}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((previous) => !previous)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setIsOpen(true);
          }
        }}
        className={cn(
          triggerVariant === "identity"
            ? "min-h-[60px] w-full justify-start gap-3 rounded-xl bg-muted/45 px-2 text-left hover:bg-muted/70"
            : "relative min-h-11 min-w-11 overflow-hidden rounded-full p-0"
        )}
      >
        {avatar}
        {triggerVariant === "identity" ? (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {displayName ?? "Your account"}
              </span>
              {usernameTag ? (
                <span className="block truncate text-xs font-normal text-muted-foreground">
                  {usernameTag}
                </span>
              ) : null}
            </span>
            <ChevronUp
              className={cn(
                "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
                isOpen && "rotate-180"
              )}
              aria-hidden
            />
          </>
        ) : null}
      </Button>
      {isOpen ? (
        <div
          role="menu"
          aria-label="Account actions"
          onKeyDown={handleMenuKeyDown}
          className={cn(
            "absolute z-[var(--layer-menu)] max-w-[calc(100vw-2rem)] rounded-xl border border-border/70 bg-background p-1.5 shadow-lg",
            triggerVariant === "identity" ? "w-full" : "w-64",
            menuAlign === "start" ? "left-0" : "right-0",
            menuPlacement === "top" ? "bottom-full mb-2" : "top-full mt-2"
          )}
        >
          {triggerVariant === "avatar" && displayName ? (
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
            className="mt-1 min-h-11 w-full justify-start px-3"
            asChild
          >
            <Link role="menuitem" href={accountHref} onClick={() => setIsOpen(false)}>
              <CircleUserRound className="h-4 w-4" aria-hidden />
              Account
            </Link>
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 w-full justify-start px-3"
            asChild
          >
            <Link role="menuitem" href={settingsHref} onClick={() => setIsOpen(false)}>
              <Settings className="h-4 w-4" aria-hidden />
              Settings
            </Link>
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 w-full justify-start px-3"
            asChild
          >
            <Link
              role="menuitem"
              href={notificationsHref}
              onClick={() => setIsOpen(false)}
            >
              <Bell className="h-4 w-4" aria-hidden />
              Notifications
              {unreadNotificationCount > 0 ? (
                <span className="ml-auto rounded-full bg-destructive px-2 py-0.5 text-[10px] font-semibold text-destructive-foreground">
                  <span className="sr-only">Unread notifications: </span>
                  {unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}
                </span>
              ) : null}
            </Link>
          </Button>
          <form
            action="/api/auth/logout"
            method="post"
            role="none"
            className="mt-1 border-t border-border/70 pt-1"
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
