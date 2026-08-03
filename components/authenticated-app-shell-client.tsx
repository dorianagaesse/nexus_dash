"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { Bell, FolderKanban, LayoutDashboard, ListTodo } from "lucide-react";

import { AccountMenu } from "@/components/account-menu";
import { NotificationLiveUpdates } from "@/components/notification-live-updates";
import { ProductFeedbackDialog } from "@/components/product-feedback-dialog";
import { ProductStateBadge } from "@/components/product-state-badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { useCurrentAppPath } from "@/lib/hooks/use-current-app-path";
import { useProjectTodoSummary } from "@/lib/hooks/use-project-todo-summary";
import {
  buildAuthenticatedDestinationHref,
  isDestinationCurrent,
  resolveContextualReturnDestination,
  type AuthenticatedDestination,
} from "@/lib/navigation/authenticated-shell";
import { useNotificationRealtimeSnapshot } from "@/lib/notification-realtime-client";
import type { NotificationRealtimeSnapshot } from "@/lib/notification-realtime-types";
import { cn } from "@/lib/utils";

interface NavigationItem {
  href: string;
  label: string;
  mobileLabel: string;
  icon: typeof FolderKanban;
}

const WORKSPACE_NAVIGATION_ITEMS: Array<
  NavigationItem & { href: AuthenticatedDestination }
> = [
  {
    href: "/projects",
    label: "Projects",
    mobileLabel: "Projects",
    icon: FolderKanban,
  },
  {
    href: "/account/notifications",
    label: "Inbox",
    mobileLabel: "Inbox",
    icon: Bell,
  },
];

function getProjectNavigationItems(projectId: string): NavigationItem[] {
  return [
    {
      href: `/projects/${projectId}`,
      label: "Overview",
      mobileLabel: "Overview",
      icon: LayoutDashboard,
    },
    {
      href: `/projects/${projectId}/todos`,
      label: "Todos",
      mobileLabel: "Todos",
      icon: ListTodo,
    },
  ];
}

interface AuthenticatedAppShellClientProps {
  displayName: string | null;
  usernameTag: string | null;
  avatarSeed: string | null;
  initialNotificationSnapshot: NotificationRealtimeSnapshot;
  notificationBanner: ReactNode;
  children: ReactNode;
}

export function AuthenticatedAppShellClient({
  displayName,
  usernameTag,
  avatarSeed,
  initialNotificationSnapshot,
  notificationBanner,
  children,
}: AuthenticatedAppShellClientProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentPath = useCurrentAppPath();
  const projectRouteMatch = pathname.match(/^\/projects\/([^/]+)(?:\/|$)/);
  const projectId = projectRouteMatch?.[1] ?? null;
  const projectNavigationItems = projectId
    ? getProjectNavigationItems(projectId)
    : [];
  const projectTodoSummary = useProjectTodoSummary(projectId);
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

  const renderNavigation = (
    items: NavigationItem[],
    options: { mobile?: boolean; workspace?: boolean } = {}
  ) =>
    items.map((item) => {
      const { mobile = false, workspace = false } = options;
      const Icon = item.icon;
      const isProjectIndexDestination = item.href === "/projects";
      const isCurrent = workspace
        ? isProjectIndexDestination
          ? pathname === "/projects"
          : isDestinationCurrent(
              pathname,
              item.href as AuthenticatedDestination
            )
        : pathname === item.href;
      const href = workspace
        ? buildAuthenticatedDestinationHref(
            item.href as AuthenticatedDestination,
            currentPath
          )
        : item.href;
      const badgeCount =
        item.href === "/account/notifications"
          ? notificationSnapshot.unreadCount
          : projectId && item.href === `/projects/${projectId}/todos`
            ? (projectTodoSummary?.activeCount ?? 0)
            : 0;
      const isTodoBadge =
        Boolean(projectId) && item.href === `/projects/${projectId}/todos`;
      const isOverdueTodoBadge =
        isTodoBadge && projectTodoSummary?.hasOverdue === true;
      const todoNavigationLabel =
        isTodoBadge && badgeCount > 0
          ? `Todos, ${badgeCount} active ${badgeCount === 1 ? "todo" : "todos"}${
              isOverdueTodoBadge ? ", overdue work present" : ""
            }`
          : undefined;

      return (
        <Link
          key={item.href}
          href={href}
          aria-label={todoNavigationLabel}
          aria-current={isCurrent ? "page" : undefined}
          className={cn(
            "group relative flex min-h-12 items-center rounded-xl font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            mobile
              ? "min-w-[4.5rem] shrink-0 touch-manipulation flex-col justify-center gap-1 px-2 py-1 text-[11px]"
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
            <Icon
              className="h-5 w-5"
              strokeWidth={isCurrent ? 2.25 : 1.8}
              aria-hidden
            />
            {badgeCount > 0 ? (
              <span
                className={cn(
                  "absolute -right-1.5 -top-1.5 grid min-h-5 min-w-5 place-items-center rounded-full px-1.5 text-[10px] font-bold tabular-nums leading-none ring-2 ring-background",
                  isTodoBadge
                    ? isOverdueTodoBadge
                      ? "bg-amber-400 text-amber-950"
                      : "bg-foreground text-background"
                    : "bg-destructive text-destructive-foreground"
                )}
              >
                {!isTodoBadge ? (
                  <span className="sr-only">
                    {badgeCount} unread notifications
                  </span>
                ) : null}
                <span aria-hidden>
                  {isTodoBadge || badgeCount <= 99 ? badgeCount : "99+"}
                </span>
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
    <div className="min-h-dvh bg-muted/20 pb-[calc(6.5rem+env(safe-area-inset-bottom))] lg:pb-0 lg:pl-64">
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
          aria-label="NexusDash alpha — projects"
        >
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-base font-bold text-primary-foreground shadow-sm">
            N
          </span>
          <span className="min-w-0">
            <span className="flex items-start gap-1.5">
              <span className="block text-base font-semibold tracking-tight">
                NexusDash
              </span>
              <ProductStateBadge className="mt-0.5" />
            </span>
            <span className="block text-xs text-muted-foreground">
              Project workspace
            </span>
          </span>
        </Link>

        <nav aria-label="Primary navigation" className="mt-7 space-y-1 px-3">
          <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/80">
            Workspace
          </p>
          {renderNavigation(WORKSPACE_NAVIGATION_ITEMS, { workspace: true })}
          {projectId ? (
            <div className="mt-5 border-t border-border/70 pt-4">
              <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/80">
                Current project
              </p>
              {renderNavigation(projectNavigationItems)}
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

        <div className="mt-auto p-3">
          <ProductFeedbackDialog triggerVariant="desktop" />
          <div className="mt-2 border-t border-border/70 pt-3">
            <AccountMenu
              isAuthenticated
              displayName={displayName}
              usernameTag={usernameTag}
              avatarSeed={avatarSeed}
              initialUnreadNotificationCount={
                initialNotificationSnapshot.unreadCount
              }
              currentPath={currentPath}
              menuPlacement="top"
              menuAlign="start"
              triggerVariant="identity"
              identityAccessory={<ThemeToggle compact />}
            />
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-[var(--layer-shell)] border-b border-border/70 bg-background/95 backdrop-blur lg:hidden">
        <div className="flex min-h-16 items-center gap-3 px-4">
          <Link
            href="/projects"
            className="flex min-h-11 min-w-0 items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="NexusDash alpha — projects"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">
              N
            </span>
            <span className="flex min-w-0 items-start gap-1.5">
              <span className="truncate text-base font-semibold tracking-tight">
                NexusDash
              </span>
              <ProductStateBadge className="mt-0.5" />
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <ProductFeedbackDialog triggerVariant="mobile" />
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

      <main
        id="app-main-content"
        tabIndex={-1}
        className="min-w-0 outline-none"
      >
        <div className="container pt-4 sm:pt-6">{notificationBanner}</div>
        {children}
      </main>

      <nav
        aria-label="Primary navigation"
        className="fixed inset-x-3 bottom-[calc(0.5rem+env(safe-area-inset-bottom))] z-[var(--layer-shell)] overflow-hidden rounded-2xl border border-border/70 bg-background/95 shadow-[0_16px_40px_-12px_rgba(15,23,42,0.35)] backdrop-blur lg:hidden"
      >
        <div className="max-w-full overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex w-max min-w-full items-stretch gap-2 p-1.5">
            <div
              role="group"
              aria-label="Workspace navigation"
              className="shrink-0 px-1 pb-1 pt-0.5"
            >
              <p
                aria-hidden="true"
                className="mb-0.5 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
              >
                Workspace
              </p>
              <div className="flex gap-1">
                {renderNavigation(WORKSPACE_NAVIGATION_ITEMS, {
                  mobile: true,
                  workspace: true,
                })}
              </div>
            </div>
            {projectId ? (
              <>
                <div
                  aria-hidden="true"
                  className="my-2 w-px shrink-0 bg-border"
                />
                <div
                  role="group"
                  aria-label="Project navigation"
                  className="shrink-0 rounded-xl border border-primary/15 bg-primary/[0.04] px-1 pb-1 pt-0.5"
                >
                  <p
                    aria-hidden="true"
                    className="mb-0.5 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary/80"
                  >
                    Project
                  </p>
                  <div className="flex gap-1">
                    {renderNavigation(projectNavigationItems, {
                      mobile: true,
                    })}
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </nav>
    </div>
  );
}
