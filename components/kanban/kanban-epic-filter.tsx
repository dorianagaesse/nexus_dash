import { Check, CircleSlash2, Flag, SlidersHorizontal, X } from "lucide-react";

import type { ProjectEpicOption } from "@/components/kanban-board-types";
import { NO_EPIC_FILTER_VALUE } from "@/components/kanban/kanban-epic-filter-utils";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface KanbanEpicFilterProps {
  epics: ProjectEpicOption[];
  selectedEpicFilters: ReadonlySet<string>;
  shownTaskCount: number;
  totalTaskCount: number;
  onToggleEpic: (value: string) => void;
  onClearEpics: () => void;
  onClearAll: () => void;
}

export function KanbanEpicFilter({
  epics,
  selectedEpicFilters,
  shownTaskCount,
  totalTaskCount,
  onToggleEpic,
  onClearEpics,
  onClearAll,
}: KanbanEpicFilterProps) {
  const hasActiveFilters = selectedEpicFilters.size > 0;

  return (
    <section
      aria-labelledby="kanban-epic-filter-title"
      className="overflow-hidden rounded-2xl border border-border/70 bg-card/75 shadow-[0_16px_38px_-36px_rgba(15,23,42,0.7)]"
      data-kanban-epic-filter="true"
    >
      <div className="flex flex-col gap-3 p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-background/75 text-muted-foreground">
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h3
                id="kanban-epic-filter-title"
                className="text-sm font-semibold text-foreground"
              >
                Filter by Epic
              </h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Show tasks from any selected Epic, including unassigned work.
              </p>
            </div>
          </div>

          <output
            aria-atomic="true"
            aria-live="polite"
            className="inline-flex min-h-11 shrink-0 items-center self-start rounded-full border border-border/60 bg-background/75 px-3 text-xs font-medium tabular-nums text-muted-foreground"
          >
            {shownTaskCount} / {totalTaskCount} tasks shown
          </output>
        </div>

        <div
          role="group"
          aria-label="Epic filters"
          className="flex max-w-full flex-wrap gap-2"
        >
          {epics.map((epic) => (
            <EpicFilterButton
              key={epic.id}
              value={epic.id}
              label={epic.name}
              isSelected={selectedEpicFilters.has(epic.id)}
              onToggle={onToggleEpic}
            />
          ))}
          <EpicFilterButton
            value={NO_EPIC_FILTER_VALUE}
            label="No epic"
            isSelected={selectedEpicFilters.has(NO_EPIC_FILTER_VALUE)}
            onToggle={onToggleEpic}
            isNoEpic
          />
        </div>

        <div className="flex flex-col gap-3 border-t border-border/60 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {hasActiveFilters
              ? `${selectedEpicFilters.size} Epic filter${selectedEpicFilters.size === 1 ? "" : "s"} active`
              : "All Epic assignments are visible"}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="ghost"
              className="min-h-11 px-3"
              disabled={!hasActiveFilters}
              onClick={onClearEpics}
            >
              <X className="h-4 w-4" aria-hidden="true" />
              Clear Epics
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 px-3"
              disabled={!hasActiveFilters}
              onClick={onClearAll}
            >
              Clear all filters
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function EpicFilterButton({
  value,
  label,
  isSelected,
  onToggle,
  isNoEpic = false,
}: {
  value: string;
  label: string;
  isSelected: boolean;
  onToggle: (value: string) => void;
  isNoEpic?: boolean;
}) {
  const Icon = isNoEpic ? CircleSlash2 : Flag;

  return (
    <button
      type="button"
      aria-pressed={isSelected}
      aria-label={`Filter tasks by Epic: ${label}`}
      className={cn(
        "inline-flex min-h-11 max-w-full cursor-pointer items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none",
        isSelected
          ? "border-primary/50 bg-primary/10 text-primary dark:bg-primary/15"
          : "border-border/70 bg-background/75 text-muted-foreground hover:border-border hover:bg-accent hover:text-accent-foreground"
      )}
      onClick={() => onToggle(value)}
    >
      {isSelected ? (
        <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
      ) : (
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      )}
      <span className="truncate">{label}</span>
    </button>
  );
}

