import { ClipboardList, FolderKanban, ListTodo } from "lucide-react";
import Link from "next/link";

import { MeetingTodoAssigneeChipReadonly } from "@/components/meeting-todos/meeting-todo-assignee-chip";
import { Badge } from "@/components/ui/badge";
import type {
  MyWorkItem,
  MyWorkItemType,
} from "@/lib/services/my-work-service";

export const MY_WORK_ROW_GRID =
  "md:grid-cols-[7rem_minmax(0,1fr)_9rem_9rem_11rem_5.5rem]";

const TYPE_LABELS: Record<MyWorkItemType, string> = {
  task: "Task",
  todo: "Todo",
  note: "Note",
};

const TYPE_ICONS: Record<MyWorkItemType, typeof FolderKanban> = {
  task: FolderKanban,
  todo: ListTodo,
  note: ClipboardList,
};

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
  const TypeIcon = TYPE_ICONS[item.type];
  const relativeTime = formatMyWorkRelativeTime(item.timestamp, now);

  return (
    <li
      data-my-work-item
      data-my-work-item-type={item.type}
      className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-4 py-3 md:items-center md:gap-y-0 ${MY_WORK_ROW_GRID}`}
    >
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <TypeIcon aria-hidden="true" className="h-4 w-4 shrink-0" />
        <span className="sr-only md:not-sr-only">{TYPE_LABELS[item.type]}</span>
      </div>
      <Link
        href={item.href}
        className="min-w-0 truncate rounded-sm text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {item.title}
      </Link>
      <time
        dateTime={item.timestamp.toISOString()}
        className="shrink-0 text-xs text-muted-foreground md:hidden"
      >
        {relativeTime}
      </time>
      <div className="col-span-3 flex flex-wrap items-center gap-x-3 gap-y-1 md:contents">
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          {item.projectName}
        </span>
        <Badge variant="secondary" className="w-fit px-2 py-0 text-[11px]">
          {item.status}
        </Badge>
        <MeetingTodoAssigneeChipReadonly
          actor={item.actor}
          bordered={false}
          identityRole={item.type === "note" ? "steward" : "assignee"}
        />
        <time
          dateTime={item.timestamp.toISOString()}
          className="hidden whitespace-nowrap text-xs text-muted-foreground md:block md:text-right"
        >
          {relativeTime}
        </time>
      </div>
    </li>
  );
}
