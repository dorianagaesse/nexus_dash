export interface NotificationRealtimeLatestUnread {
  title: string;
}

export interface NotificationRealtimeSnapshot {
  version: string;
  unreadCount: number;
  latestUnreadNotification: NotificationRealtimeLatestUnread | null;
  serverTime: string;
}
