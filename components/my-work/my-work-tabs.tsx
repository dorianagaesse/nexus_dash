import Link from "next/link";

import { MY_WORK_VIEWS, type MyWorkView } from "@/lib/services/my-work-service";
import { cn } from "@/lib/utils";

export const MY_WORK_VIEW_LABELS: Record<MyWorkView, string> = {
  assigned: "Assigned to me",
  unassigned: "Unassigned",
  reassignment: "Needs reassignment",
  recent: "Recently changed",
};

export function myWorkViewHref(view: MyWorkView): string {
  return view === "assigned" ? "/my-work" : `/my-work?view=${view}`;
}

export function MyWorkTabs({ activeView }: { activeView: MyWorkView }) {
  return (
    <nav aria-label="My work views" className="flex flex-wrap gap-2">
      {MY_WORK_VIEWS.map((view) => {
        const isActive = view === activeView;
        return (
          <Link
            key={view}
            href={myWorkViewHref(view)}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              isActive
                ? "border-primary/30 bg-primary/10 text-primary dark:bg-primary/15"
                : "border-border/70 bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {MY_WORK_VIEW_LABELS[view]}
          </Link>
        );
      })}
    </nav>
  );
}
