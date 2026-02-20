import { ChevronDown, ChevronUp, Columns3 } from "lucide-react";

import type { TaskMutationStatus } from "@/components/kanban-board-types";

interface KanbanBoardHeaderProps {
  isExpanded: boolean;
  totalTaskCount: number;
  isSaving: boolean;
  taskMutationStatus: TaskMutationStatus | null;
  headerAction?: React.ReactNode;
  onToggleExpanded: () => void;
}

export function KanbanBoardHeader({
  isExpanded,
  totalTaskCount,
  isSaving,
  taskMutationStatus,
  headerAction,
  onToggleExpanded,
}: KanbanBoardHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <button
        type="button"
        onClick={onToggleExpanded}
        aria-expanded={isExpanded}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left transition hover:bg-muted/40"
      >
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
        <h2 className="text-lg font-semibold tracking-tight">
          <span className="inline-flex items-center gap-2">
            <Columns3 className="h-4 w-4 text-muted-foreground" />
            Kanban board
          </span>
        </h2>
        {!isExpanded ? (
          <span className="ml-auto text-xs text-muted-foreground">
            {totalTaskCount} task{totalTaskCount === 1 ? "" : "s"}
          </span>
        ) : null}
      </button>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {isExpanded ? (
          <span className="text-xs text-muted-foreground">
            {isSaving ? "Saving movement..." : "Drag cards to update status"}
          </span>
        ) : null}
        {taskMutationStatus ? (
          <span
            className={
              taskMutationStatus.phase === "failed"
                ? "rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive"
                : "text-xs text-muted-foreground"
            }
            role="status"
            aria-live="polite"
          >
            {taskMutationStatus.message}
          </span>
        ) : null}
        {headerAction ? <div>{headerAction}</div> : null}
      </div>
    </div>
  );
}
