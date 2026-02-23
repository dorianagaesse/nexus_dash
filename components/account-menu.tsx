"use client";

import Link from "next/link";
import { useState } from "react";
import { CircleUserRound, LogOut, Settings } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useDismissibleMenu } from "@/lib/hooks/use-dismissible-menu";

interface AccountMenuProps {
  isAuthenticated: boolean;
}

export function AccountMenu({ isAuthenticated }: AccountMenuProps) {
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
      >
        <CircleUserRound className="h-5 w-5" />
      </Button>
      {isOpen ? (
        <div className="absolute right-0 z-30 mt-1 w-44 rounded-md border border-border/70 bg-background p-1 shadow-md">
          <Button type="button" variant="ghost" className="w-full justify-start" asChild>
            <Link href="/account/settings" onClick={() => setIsOpen(false)}>
              <Settings className="h-4 w-4" />
              Settings
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
