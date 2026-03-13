import { ChevronDown, ChevronUp, Columns3 } from "lucide-react";

import { PROJECT_SECTION_CHROME_CLASS } from "@/components/project-dashboard/project-section-chrome";
import { cn } from "@/lib/utils";

interface KanbanBoardHeaderProps {
  isExpanded: boolean;
  totalTaskCount: number;
  isSaving: boolean;
  headerAction?: React.ReactNode;
  onToggleExpanded: () => void;
}

export function KanbanBoardHeader({
  isExpanded,
  totalTaskCount,
  isSaving,
  headerAction,
  onToggleExpanded,
}: KanbanBoardHeaderProps) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 px-5 py-4", PROJECT_SECTION_CHROME_CLASS)}>
      <button
        type="button"
        onClick={onToggleExpanded}
        aria-expanded={isExpanded}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-1.5 text-left transition hover:bg-muted/40"
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
        <span className="ml-auto rounded-full border border-border/60 bg-background/70 px-2.5 py-1 text-xs text-muted-foreground">
          {totalTaskCount} task{totalTaskCount === 1 ? "" : "s"}
        </span>
      </button>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {isExpanded && isSaving ? (
          <span className="text-xs text-muted-foreground">
            Saving movement...
          </span>
        ) : null}
        {headerAction ? <div>{headerAction}</div> : null}
      </div>
    </div>
  );
}
