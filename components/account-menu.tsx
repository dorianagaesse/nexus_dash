"use client";

import Link from "next/link";
import { useState } from "react";
import { CircleUserRound, LogOut, MailPlus, Settings } from "lucide-react";

import { UserAvatar } from "@/components/ui/user-avatar";
import { Button } from "@/components/ui/button";
import { useDismissibleMenu } from "@/lib/hooks/use-dismissible-menu";

interface AccountMenuProps {
  isAuthenticated: boolean;
  displayName: string | null;
  usernameTag: string | null;
  avatarSeed: string | null;
  pendingInvitationCount: number;
}

export function AccountMenu({
  isAuthenticated,
  displayName,
  usernameTag,
  avatarSeed,
  pendingInvitationCount,
}: AccountMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useDismissibleMenu<HTMLDivElement>(isOpen, () => setIsOpen(false));

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
        className="relative overflow-hidden rounded-full p-0"
      >
        {avatarSeed && displayName ? (
          <UserAvatar
            avatarSeed={avatarSeed}
            displayName={displayName}
            className="h-full w-full border-none"
          />
        ) : (
          <CircleUserRound className="h-5 w-5" />
        )}
        {pendingInvitationCount > 0 ? (
          <span
            aria-hidden="true"
            className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-background"
          />
        ) : null}
      </Button>
      {isOpen ? (
        <div className="absolute right-0 z-30 mt-1 w-56 rounded-md border border-border/70 bg-background p-1 shadow-md">
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
          <Button type="button" variant="ghost" className="w-full justify-start" asChild>
            <Link href="/account" onClick={() => setIsOpen(false)}>
              <CircleUserRound className="h-4 w-4" />
              Account
            </Link>
          </Button>
          <Button type="button" variant="ghost" className="w-full justify-start" asChild>
            <Link href="/account/settings" onClick={() => setIsOpen(false)}>
              <Settings className="h-4 w-4" />
              Settings
            </Link>
          </Button>
          <Button type="button" variant="ghost" className="w-full justify-start" asChild>
            <Link href="/account#project-invitations" onClick={() => setIsOpen(false)}>
              <MailPlus className="h-4 w-4" />
              Invitations
              {pendingInvitationCount > 0 ? (
                <span className="ml-auto rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-medium text-white">
                  {pendingInvitationCount}
                </span>
              ) : null}
            </Link>
          </Button>
          <form action="/api/auth/logout" method="post">
            <Button type="submit" variant="ghost" className="w-full justify-start">
              <LogOut className="h-4 w-4" />
              Log out
            </Button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
