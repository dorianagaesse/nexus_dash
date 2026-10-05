import Link from "next/link";

import { MeetingTodoAssigneeChipReadonly } from "@/components/meeting-todos/meeting-todo-assignee-chip";
import { Badge } from "@/components/ui/badge";
import type { MyWorkItem } from "@/lib/services/my-work-service";

const ABSOLUTE_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC",
});

export function formatMyWorkRelativeTime(timestamp: Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - timestamp.getTime()) / 60_000);
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days}d ago`;
  }
  return ABSOLUTE_TIME_FORMATTER.format(timestamp);
}

export function MyWorkRow({ item, now }: { item: MyWorkItem; now: Date }) {
  return (
    <li className="flex min-w-0 flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0 flex-1 space-y-1.5">
        <Link
          href={item.href}
          className="block truncate rounded-sm text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {item.title}
        </Link>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="max-w-52 truncate">{item.projectName}</span>
          {item.lane ? (
            <Badge variant="secondary" className="px-2 py-0 text-[11px]">
              {item.lane}
            </Badge>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <MeetingTodoAssigneeChipReadonly
          actor={item.actor}
          bordered={false}
          identityRole={item.type === "note" ? "steward" : "assignee"}
        />
        <time
          dateTime={item.timestamp.toISOString()}
          className="whitespace-nowrap text-xs text-muted-foreground"
        >
          {formatMyWorkRelativeTime(item.timestamp, now)}
        </time>
      </div>
    </li>
  );
}
