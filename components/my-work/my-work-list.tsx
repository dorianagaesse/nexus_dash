import Link from "next/link";

import { MyWorkRow, MY_WORK_ROW_GRID } from "@/components/my-work/my-work-row";
import {
  MY_WORK_TYPE_LIMIT,
  type MyWorkResult,
} from "@/lib/services/my-work-service";

export function MyWorkList({
  result,
  hasActiveFilters,
  now,
}: {
  result: MyWorkResult;
  hasActiveFilters: boolean;
  now: Date;
}) {
  if (result.items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-10 text-center">
        <p className="text-sm text-muted-foreground">
          No work items match these filters.
        </p>
        {hasActiveFilters ? (
          <Link
            href="/my-work"
            className="mt-2 inline-block text-sm font-medium underline underline-offset-4"
          >
            Clear filters
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div
        data-my-work-list
        className="overflow-hidden rounded-xl border border-border/70 bg-background"
      >
        <div
          className={`hidden border-b border-border/70 bg-muted/20 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground md:grid md:items-center md:gap-x-3 ${MY_WORK_ROW_GRID}`}
        >
          <span>Type</span>
          <span>Title</span>
          <span>Project</span>
          <span>Status</span>
          <span>Assignee</span>
          <span className="text-right">Updated</span>
        </div>
        <ul className="divide-y divide-border/70">
          {result.items.map((item) => (
            <MyWorkRow key={`${item.type}-${item.id}`} item={item} now={now} />
          ))}
        </ul>
      </div>
      {result.truncated ? (
        <p className="text-xs text-muted-foreground">
          Showing the first {MY_WORK_TYPE_LIMIT} items per type.
        </p>
      ) : null}
    </div>
  );
}
