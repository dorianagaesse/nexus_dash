"use client";

import * as React from "react";
import { createPortal } from "react-dom";

import { UserAvatar } from "@/components/ui/user-avatar";
import { cn } from "@/lib/utils";

export interface MentionDisplayUser {
  id: string;
  displayName: string;
  usernameTag: string | null;
  avatarSeed: string;
}

export interface MentionLookup {
  username: string;
  discriminator: string | null;
}

export function resolveMentionDisplayUser(
  mention: MentionLookup,
  users: MentionDisplayUser[] | undefined
): MentionDisplayUser | null {
  if (!users || users.length === 0) {
    return null;
  }

  const normalizedUsername = mention.username.toLowerCase();
  const normalizedDiscriminator = mention.discriminator?.toLowerCase() ?? null;

  return (
    users.find((user) => {
      const [username, discriminator] = (user.usernameTag ?? "").toLowerCase().split("#");
      if (!username) {
        return false;
      }

      if (normalizedDiscriminator) {
        return username === normalizedUsername && discriminator === normalizedDiscriminator;
      }

      return username === normalizedUsername;
    }) ?? null
  );
}

export function MentionTooltipPortal({
  user,
  anchorRect,
}: {
  user: MentionDisplayUser;
  anchorRect: DOMRect;
}) {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || typeof document === "undefined") {
    return null;
  }

  const viewportWidth = window.innerWidth;
  const left = Math.max(12, Math.min(anchorRect.left, viewportWidth - 252));
  const top = Math.max(anchorRect.bottom + 8, 12);

  return createPortal(
    <div
      role="tooltip"
      className="pointer-events-none fixed z-[140] flex w-60 items-center gap-3 rounded-lg border border-border/70 bg-background px-3 py-2 text-foreground shadow-lg"
      style={{ left, top }}
    >
      <UserAvatar
        avatarSeed={user.avatarSeed}
        displayName={user.displayName}
        className="h-9 w-9 border-border/70"
      />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{user.displayName}</span>
        {user.usernameTag ? (
          <span className="block truncate text-xs text-muted-foreground">
            {user.usernameTag}
          </span>
        ) : null}
      </span>
    </div>,
    document.body
  );
}

export function MentionText({
  mention,
  children,
  users,
  className,
}: {
  mention: MentionLookup;
  children: React.ReactNode;
  users?: MentionDisplayUser[];
  className?: string;
}) {
  const user = resolveMentionDisplayUser(mention, users);
  const [anchorRect, setAnchorRect] = React.useState<DOMRect | null>(null);

  const showTooltip = (element: HTMLElement) => {
    if (user) {
      setAnchorRect(element.getBoundingClientRect());
    }
  };

  return (
    <>
      <span
        tabIndex={user ? 0 : undefined}
        className={cn(
          "rounded-md bg-primary/15 px-1 py-0.5 font-medium text-primary not-italic",
          user &&
            "cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          className
        )}
        title={
          user
            ? `${user.displayName}${user.usernameTag ? ` (${user.usernameTag})` : ""}`
            : undefined
        }
        onMouseEnter={(event) => showTooltip(event.currentTarget)}
        onMouseLeave={() => setAnchorRect(null)}
        onFocus={(event) => showTooltip(event.currentTarget)}
        onBlur={() => setAnchorRect(null)}
      >
        {user ? `@${user.displayName}` : children}
      </span>
      {user && anchorRect ? (
        <MentionTooltipPortal user={user} anchorRect={anchorRect} />
      ) : null}
    </>
  );
}
