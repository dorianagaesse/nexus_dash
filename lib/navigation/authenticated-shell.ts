import { appendQueryToPath, normalizeReturnToPath } from "@/lib/navigation/return-to";

export const AUTHENTICATED_DESTINATIONS = [
  "/projects",
  "/account/notifications",
  "/account",
  "/account/settings",
] as const;

export type AuthenticatedDestination =
  (typeof AUTHENTICATED_DESTINATIONS)[number];

const APP_ORIGIN = "https://nexusdash.local";

function isAllowedReturnPath(path: string): boolean {
  const pathname = new URL(path, APP_ORIGIN).pathname;
  return (
    pathname === "/projects" ||
    pathname.startsWith("/projects/") ||
    pathname === "/account/notifications"
  );
}

export function normalizeAuthenticatedReturnToPath(
  value: string | null | undefined,
  fallback = "/projects"
): string {
  const normalized = normalizeReturnToPath(value, "");
  return normalized && isAllowedReturnPath(normalized) ? normalized : fallback;
}

export function resolvePreservedOrigin(currentPath: string): string {
  const normalizedCurrentPath = normalizeReturnToPath(currentPath, "/projects");
  const parsed = new URL(normalizedCurrentPath, APP_ORIGIN);

  if (parsed.pathname.startsWith("/account")) {
    return normalizeAuthenticatedReturnToPath(
      parsed.searchParams.get("returnTo"),
      "/projects"
    );
  }

  return normalizeAuthenticatedReturnToPath(normalizedCurrentPath, "/projects");
}

export function buildAuthenticatedDestinationHref(
  destination: AuthenticatedDestination,
  currentPath: string
): string {
  if (destination === "/projects") {
    return destination;
  }

  return appendQueryToPath(destination, {
    returnTo: resolvePreservedOrigin(currentPath),
  });
}

export function buildNotificationTargetHref(
  targetPath: string,
  notificationCenterPath: string
): string {
  const normalizedTarget = normalizeReturnToPath(targetPath, "/projects");
  const targetUrl = new URL(normalizedTarget, APP_ORIGIN);
  const safeTarget = targetUrl.pathname.startsWith("/api/")
    ? "/projects"
    : normalizedTarget;
  const normalizedNotificationCenter = normalizeAuthenticatedReturnToPath(
    notificationCenterPath,
    "/account/notifications"
  );

  return appendQueryToPath(safeTarget, {
    returnTo: normalizedNotificationCenter,
  });
}

export interface ContextualReturnDestination {
  href: string;
  label: string;
}

export function resolveContextualReturnDestination(
  value: string | null | undefined,
  fallback: ContextualReturnDestination
): ContextualReturnDestination {
  const href = normalizeAuthenticatedReturnToPath(value, fallback.href);

  if (href.startsWith("/account/notifications")) {
    return { href, label: "Return to notifications" };
  }

  if (href.startsWith("/projects/")) {
    return { href, label: "Return to project" };
  }

  if (href === "/projects") {
    return { href, label: "Projects" };
  }

  return { href, label: fallback.label };
}

export function isDestinationCurrent(
  pathname: string,
  destination: AuthenticatedDestination
): boolean {
  if (destination === "/projects") {
    return pathname === "/projects" || pathname.startsWith("/projects/");
  }
  if (destination === "/account/settings") {
    return pathname === destination || pathname.startsWith(`${destination}/`);
  }

  return pathname === destination;
}
