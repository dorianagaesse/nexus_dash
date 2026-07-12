"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { Bell, FolderKanban } from "lucide-react";

import { AccountMenu } from "@/components/account-menu";
import { NotificationLiveUpdates } from "@/components/notification-live-updates";
import { ThemeToggle } from "@/components/theme-toggle";
import type { AppMetadataSummary } from "@/lib/app-metadata";
import { useNotificationRealtimeSnapshot } from "@/lib/notification-realtime-client";
import type { NotificationRealtimeSnapshot } from "@/lib/notification-realtime-types";
import { useCurrentAppPath } from "@/lib/hooks/use-current-app-path";
import {
  AUTHENTICATED_DESTINATIONS,
  buildAuthenticatedDestinationHref,
  isDestinationCurrent,
  resolveContextualReturnDestination,
  type AuthenticatedDestination,
} from "@/lib/navigation/authenticated-shell";
import { cn } from "@/lib/utils";

const NAVIGATION_ITEMS: Array<{
  href: AuthenticatedDestination;
  label: string;
  icon: typeof FolderKanban;
}> = [
  {
    href: AUTHENTICATED_DESTINATIONS[0],
    label: "Projects",
    icon: FolderKanban,
  },
  { href: AUTHENTICATED_DESTINATIONS[1], label: "Notifications", icon: Bell },
];

interface AuthenticatedAppShellClientProps {
  displayName: string | null;
  usernameTag: string | null;
  avatarSeed: string | null;
  initialNotificationSnapshot: NotificationRealtimeSnapshot;
  appMetadata: AppMetadataSummary;
  notificationBanner: ReactNode;
  children: ReactNode;
}

export function AuthenticatedAppShellClient({
  displayName,
  usernameTag,
  avatarSeed,
  initialNotificationSnapshot,
  appMetadata,
  notificationBanner,
  children,
}: AuthenticatedAppShellClientProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentPath = useCurrentAppPath();
  const contextualReturn = resolveContextualReturnDestination(
    searchParams.get("returnTo"),
    { href: "/projects", label: "Projects" }
  );
  const notificationSnapshot = useNotificationRealtimeSnapshot(
    initialNotificationSnapshot
  );
  const unreadNotificationCount = notificationSnapshot.unreadCount;
  const showContextualReturn =
    pathname.startsWith("/projects/") &&
    contextualReturn.href.startsWith("/account/notifications");

  const navigation = (
    <>
      {NAVIGATION_ITEMS.map((item) => {
        const Icon = item.icon;
        const isCurrent = isDestinationCurrent(pathname, item.href);
        const href = buildAuthenticatedDestinationHref(item.href, currentPath);

        return (
          <Link
            key={item.href}
            href={href}
            aria-current={isCurrent ? "page" : undefined}
            className={cn(
              "relative inline-flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors duration-200 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:min-h-11 md:min-w-11 md:flex-row md:gap-2 md:px-3 md:py-0 md:text-sm",
              isCurrent && "bg-accent text-foreground"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            <span>{item.label}</span>
            {item.href === "/account/notifications" &&
            unreadNotificationCount > 0 ? (
              <span
                className="absolute right-3 top-2 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-background md:right-1.5 md:top-1.5"
                aria-hidden="true"
              />
            ) : null}
          </Link>
        );
      })}
    </>
  );

  return (
    <div className="min-h-dvh bg-background pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">
      <NotificationLiveUpdates initialSnapshot={initialNotificationSnapshot} />
      <a
        href="#app-main-content"
        className="fixed left-4 top-2 z-[var(--layer-skip-link)] -translate-y-20 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus:translate-y-0"
      >
        Skip to main content
      </a>

      <header className="sticky top-0 z-[var(--layer-shell)] border-b border-border/70 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
        <div className="container flex min-h-16 items-center gap-3 py-2">
          <Link
            href="/projects"
            className="flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-1 text-base font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="NexusDash projects"
          >
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-foreground text-sm font-bold text-background">
              N
            </span>
            <span className="hidden sm:inline">NexusDash</span>
          </Link>

          <nav
            aria-label="Primary navigation"
            className="ml-3 hidden items-center gap-1 md:flex"
          >
            {navigation}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle compact />
            <AccountMenu
              isAuthenticated
              displayName={displayName}
              usernameTag={usernameTag}
              avatarSeed={avatarSeed}
              initialUnreadNotificationCount={
                initialNotificationSnapshot.unreadCount
              }
              currentPath={currentPath}
              appMetadata={appMetadata}
            />
          </div>
        </div>

        {showContextualReturn ? (
          <div className="border-t border-border/60 bg-muted/35">
            <div className="container flex min-h-11 items-center">
              <Link
                href={contextualReturn.href}
                className="inline-flex min-h-11 items-center rounded-md text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {contextualReturn.label}
              </Link>
            </div>
          </div>
        ) : null}
      </header>

      <div id="app-main-content" tabIndex={-1} className="outline-none">
        <div className="container pt-4 sm:pt-6">{notificationBanner}</div>
        {children}
      </div>

      <nav
        aria-label="Primary navigation"
        className="fixed inset-x-0 bottom-0 z-[var(--layer-shell)] grid grid-cols-2 border-t border-border/70 bg-background px-4 pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_30px_-24px_rgba(15,23,42,0.65)] md:hidden"
      >
        {navigation}
      </nav>
    </div>
  );
}
