import { ChevronDown, ChevronUp, Columns3 } from "lucide-react";

import { PROJECT_SECTION_CHROME_CLASS } from "@/components/project-dashboard/project-section-chrome";
import { cn } from "@/lib/utils";

interface KanbanBoardHeaderProps {
  isExpanded: boolean;
  totalTaskCount: number;
  overdueDeadlineCount: number;
  soonDeadlineCount: number;
  isSaving: boolean;
  headerAction?: React.ReactNode;
  onToggleExpanded: () => void;
}

export function KanbanBoardHeader({
  isExpanded,
  totalTaskCount,
  overdueDeadlineCount,
  soonDeadlineCount,
  isSaving,
  headerAction,
  onToggleExpanded,
}: KanbanBoardHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-stretch gap-3 px-4 py-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:px-5",
        PROJECT_SECTION_CHROME_CLASS
      )}
    >
      <button
        type="button"
        onClick={onToggleExpanded}
        aria-expanded={isExpanded}
        className="flex min-w-0 w-full flex-1 items-center gap-3 rounded-xl px-2 py-1.5 text-left transition hover:bg-muted/40"
      >
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
        <div className="min-w-0 space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">
            <span className="inline-flex items-center gap-2">
              <Columns3 className="h-4 w-4 text-muted-foreground" />
              Kanban board
            </span>
          </h2>
        </div>
        <span className="rounded-full border border-border/60 bg-background/70 px-2.5 py-1 text-xs text-muted-foreground sm:ml-auto">
          {totalTaskCount} task{totalTaskCount === 1 ? "" : "s"}
        </span>
        {overdueDeadlineCount > 0 ? (
          <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs text-red-700 dark:text-red-200">
            {overdueDeadlineCount} overdue
          </span>
        ) : null}
        {soonDeadlineCount > 0 ? (
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-700 dark:text-amber-200">
            {soonDeadlineCount} due soon
          </span>
        ) : null}
      </button>

      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
        {isExpanded && isSaving ? (
          <span className="text-xs text-muted-foreground">
            Saving movement...
          </span>
        ) : null}
        {headerAction ? <div className="w-full sm:w-auto">{headerAction}</div> : null}
      </div>
    </div>
  );
}
