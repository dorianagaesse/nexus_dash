"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { Bell, FolderKanban, LayoutDashboard } from "lucide-react";

import { AccountMenu } from "@/components/account-menu";
import { NotificationLiveUpdates } from "@/components/notification-live-updates";
import type { AppMetadataSummary } from "@/lib/app-metadata";
import { useCurrentAppPath } from "@/lib/hooks/use-current-app-path";
import {
  AUTHENTICATED_DESTINATIONS,
  buildAuthenticatedDestinationHref,
  isDestinationCurrent,
  resolveContextualReturnDestination,
  type AuthenticatedDestination,
} from "@/lib/navigation/authenticated-shell";
import { useNotificationRealtimeSnapshot } from "@/lib/notification-realtime-client";
import type { NotificationRealtimeSnapshot } from "@/lib/notification-realtime-types";
import { cn } from "@/lib/utils";

const NAVIGATION_ITEMS: Array<{
  href: AuthenticatedDestination;
  label: string;
  mobileLabel: string;
  icon: typeof FolderKanban;
}> = [
  {
    href: AUTHENTICATED_DESTINATIONS[0],
    label: "Projects",
    mobileLabel: "Projects",
    icon: FolderKanban,
  },
  {
    href: AUTHENTICATED_DESTINATIONS[1],
    label: "Inbox",
    mobileLabel: "Inbox",
    icon: Bell,
  },
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
  const projectRouteMatch = pathname.match(/^\/projects\/([^/]+)$/);
  const projectId = projectRouteMatch?.[1] ?? null;
  const notificationSnapshot = useNotificationRealtimeSnapshot(
    initialNotificationSnapshot
  );
  const contextualReturn = resolveContextualReturnDestination(
    searchParams.get("returnTo"),
    { href: "/projects", label: "Projects" }
  );
  const showContextualReturn =
    pathname.startsWith("/projects/") &&
    contextualReturn.href.startsWith("/account/notifications");

  const navigation = (mobile = false) =>
    NAVIGATION_ITEMS.map((item) => {
      const Icon = item.icon;
      const isProjectIndexDestination = item.href === "/projects";
      const isCurrent =
        isProjectIndexDestination && projectId && !mobile
          ? false
          : isDestinationCurrent(pathname, item.href);
      const href = buildAuthenticatedDestinationHref(item.href, currentPath);
      const unread =
        item.href === "/account/notifications"
          ? notificationSnapshot.unreadCount
          : 0;

      return (
        <Link
          key={item.href}
          href={href}
          aria-current={isCurrent ? "page" : undefined}
          className={cn(
            "group relative flex min-h-12 items-center rounded-xl font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            mobile
              ? "min-w-0 flex-col justify-center gap-1 px-3 py-1 text-[11px]"
              : "gap-3 px-3 text-sm",
            isCurrent
              ? "bg-primary/10 text-primary dark:bg-primary/15"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          {!mobile && isCurrent ? (
            <span
              className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary"
              aria-hidden="true"
            />
          ) : null}
          <span className="relative grid h-7 w-7 shrink-0 place-items-center">
            <Icon className="h-5 w-5" strokeWidth={isCurrent ? 2.25 : 1.8} aria-hidden />
            {unread > 0 ? (
              <span className="absolute -right-1 -top-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[9px] font-bold leading-none text-destructive-foreground ring-2 ring-background">
                <span className="sr-only">{unread} unread notifications</span>
                <span aria-hidden>{unread > 99 ? "99+" : unread}</span>
              </span>
            ) : null}
          </span>
          <span>
            {mobile
              ? item.mobileLabel
              : isProjectIndexDestination && projectId
                ? "All projects"
                : item.label}
          </span>
        </Link>
      );
    });

  return (
    <div className="min-h-dvh bg-muted/20 pb-[calc(4.75rem+env(safe-area-inset-bottom))] lg:pb-0 lg:pl-64">
      <NotificationLiveUpdates initialSnapshot={initialNotificationSnapshot} />
      <a
        href="#app-main-content"
        className="fixed left-4 top-2 z-[var(--layer-skip-link)] -translate-y-20 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg focus:translate-y-0"
      >
        Skip to main content
      </a>

      <aside className="fixed inset-y-0 left-0 z-[var(--layer-shell)] hidden w-64 flex-col border-r border-border/70 bg-background lg:flex">
        <Link
          href="/projects"
          className="mx-4 mt-4 flex min-h-14 items-center gap-3 rounded-xl px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="NexusDash projects"
        >
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-base font-bold text-primary-foreground shadow-sm">
            N
          </span>
          <span>
            <span className="block text-base font-semibold tracking-tight">NexusDash</span>
            <span className="block text-xs text-muted-foreground">Project workspace</span>
          </span>
        </Link>

        <nav aria-label="Primary navigation" className="mt-7 space-y-1 px-3">
          <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/80">
            Workspace
          </p>
          {navigation()}
          {projectId ? (
            <div className="mt-5 border-t border-border/70 pt-4">
              <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/80">
                Current project
              </p>
              <Link
                href={`/projects/${projectId}`}
                aria-current="page"
                className="relative flex min-h-12 items-center gap-3 rounded-xl bg-primary/10 px-3 text-sm font-medium text-primary transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:bg-primary/15"
              >
                <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary" aria-hidden />
                <span className="grid h-7 w-7 place-items-center">
                  <LayoutDashboard className="h-5 w-5" strokeWidth={2.25} aria-hidden />
                </span>
                Overview
              </Link>
              <div id="project-sidebar-actions" className="mt-1" />
            </div>
          ) : null}
        </nav>

        {showContextualReturn ? (
          <div className="mx-3 mt-5 border-t border-border/70 pt-3">
            <Link
              href={contextualReturn.href}
              className="flex min-h-11 items-center rounded-xl px-3 text-sm font-medium text-muted-foreground underline-offset-4 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {contextualReturn.label}
            </Link>
          </div>
        ) : null}

        <div className="mt-auto border-t border-border/70 p-3">
          <div className="flex items-center gap-2 rounded-xl bg-muted/45 p-2">
            <AccountMenu
              isAuthenticated
              displayName={displayName}
              usernameTag={usernameTag}
              avatarSeed={avatarSeed}
              initialUnreadNotificationCount={initialNotificationSnapshot.unreadCount}
              currentPath={currentPath}
              appMetadata={appMetadata}
              menuPlacement="top"
              menuAlign="start"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{displayName ?? "Your account"}</p>
              {usernameTag ? <p className="truncate text-xs text-muted-foreground">{usernameTag}</p> : null}
            </div>
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-[var(--layer-shell)] border-b border-border/70 bg-background/95 backdrop-blur lg:hidden">
        <div className="flex min-h-16 items-center gap-3 px-4">
          <Link
            href="/projects"
            className="flex min-h-11 min-w-0 items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="NexusDash projects"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">N</span>
            <span className="truncate text-base font-semibold tracking-tight">NexusDash</span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <AccountMenu
              isAuthenticated
              displayName={displayName}
              usernameTag={usernameTag}
              avatarSeed={avatarSeed}
              initialUnreadNotificationCount={initialNotificationSnapshot.unreadCount}
              currentPath={currentPath}
              appMetadata={appMetadata}
            />
          </div>
        </div>
        {showContextualReturn ? (
          <div className="border-t border-border/60 bg-muted/35 px-4">
            <Link
              href={contextualReturn.href}
              className="inline-flex min-h-11 items-center text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {contextualReturn.label}
            </Link>
          </div>
        ) : null}
      </header>

      <main id="app-main-content" tabIndex={-1} className="min-w-0 outline-none">
        <div className="container pt-4 sm:pt-6">{notificationBanner}</div>
        {children}
      </main>

      <nav
        aria-label="Primary navigation"
        className="fixed inset-x-3 bottom-[calc(0.5rem+env(safe-area-inset-bottom))] z-[var(--layer-shell)] grid grid-cols-2 rounded-2xl border border-border/70 bg-background/95 p-1.5 shadow-[0_16px_40px_-12px_rgba(15,23,42,0.35)] backdrop-blur lg:hidden"
      >
        {navigation(true)}
      </nav>
    </div>
  );
}
