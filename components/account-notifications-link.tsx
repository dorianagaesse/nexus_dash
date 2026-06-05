"use client";

import Link from "next/link";
import { Bell } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useNotificationRealtimeSnapshot } from "@/lib/notification-realtime-client";
import type { NotificationRealtimeSnapshot } from "@/lib/notification-realtime-types";

interface AccountNotificationsLinkProps {
  initialSnapshot: NotificationRealtimeSnapshot;
}

export function AccountNotificationsLink({
  initialSnapshot,
}: AccountNotificationsLinkProps) {
  const snapshot = useNotificationRealtimeSnapshot(initialSnapshot);
  const unreadNotificationCount = snapshot.unreadCount;

  return (
    <Button
      asChild
      variant="outline"
      className="relative rounded-full border-border/60 px-3 py-1.5 text-sm font-medium text-muted-foreground hover:border-border hover:text-foreground"
    >
      <Link href="/account/notifications">
        <Bell className="h-4 w-4" />
        Notifications
        {unreadNotificationCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-medium text-white">
            {unreadNotificationCount > 9 ? "9+" : unreadNotificationCount}
          </span>
        ) : null}
      </Link>
    </Button>
  );
}
