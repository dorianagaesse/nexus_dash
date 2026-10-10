import { Check, ChevronDown } from "lucide-react";
import Link from "next/link";

import {
  MY_WORK_SORTS,
  MY_WORK_TYPE_FILTERS,
  type MyWorkResult,
  type MyWorkSort,
  type MyWorkTypeFilter,
} from "@/lib/services/my-work-service";
import { cn } from "@/lib/utils";

export interface MyWorkFilterState {
  type: MyWorkTypeFilter;
  projectId: string | null;
  query: string;
  sort: MyWorkSort;
}

export const MY_WORK_DEFAULT_FILTERS: MyWorkFilterState = {
  type: "all",
  projectId: null,
  query: "",
  sort: "recent",
};

const TYPE_LABELS: Record<MyWorkTypeFilter, string> = {
  all: "All types",
  task: "Tasks",
  todo: "Todos",
};

const SORT_LABELS: Record<MyWorkSort, string> = {
  recent: "Recently updated",
  oldest: "Oldest first",
};

export function myWorkHref(
  state: MyWorkFilterState,
  overrides: Partial<MyWorkFilterState> = {}
): string {
  const next = { ...state, ...overrides };
  const params = new URLSearchParams();
  if (next.type !== "all") {
    params.set("type", next.type);
  }
  if (next.projectId) {
    params.set("project", next.projectId);
  }
  if (next.sort !== "recent") {
    params.set("sort", next.sort);
  }
  if (next.query) {
    params.set("q", next.query);
  }
  const queryString = params.toString();
  return queryString ? `/my-work?${queryString}` : "/my-work";
}

interface FilterOption {
  key: string;
  label: string;
  href: string;
  active: boolean;
}

function FilterDropdown({
  name,
  summary,
  options,
}: {
  name: string;
  summary: string;
  options: FilterOption[];
}) {
  return (
    <details data-my-work-filter={name} className="relative">
      <summary
        className={cn(
          "flex h-11 cursor-pointer select-none list-none items-center gap-1.5 rounded-md border border-border/70 bg-background px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden"
        )}
      >
        <span className="truncate">{summary}</span>
        <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      </summary>
      <div className="absolute left-0 z-50 mt-1 max-w-[calc(100vw-2rem)] min-w-52 rounded-md border border-border/70 bg-card p-1 shadow-lg">
        {options.map((option) => (
          <Link
            key={option.key}
            href={option.href}
            aria-current={option.active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded px-2 py-2 text-sm transition-colors",
              option.active
                ? "font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Check
              aria-hidden="true"
              className={cn("h-4 w-4 shrink-0", option.active ? "opacity-100" : "opacity-0")}
            />
            <span className="truncate">{option.label}</span>
          </Link>
        ))}
      </div>
    </details>
  );
}

export function MyWorkFilters({
  filters,
  result,
}: {
  filters: MyWorkFilterState;
  result: MyWorkResult | null;
}) {
  const typeOptions: FilterOption[] = MY_WORK_TYPE_FILTERS.map(
    (typeValue) => ({
      key: typeValue,
      label: `${TYPE_LABELS[typeValue]}${
        result ? ` (${result.typeCounts[typeValue]})` : ""
      }`,
      href: myWorkHref(filters, { type: typeValue }),
      active: filters.type === typeValue,
    })
  );

  const activeProjectName = result?.projects.find(
    (project) => project.id === filters.projectId
  )?.name;
  const projectOptions: FilterOption[] = [
    {
      key: "all",
      label: `All projects${result ? ` (${result.typeCounts.all})` : ""}`,
      href: myWorkHref(filters, { projectId: null }),
      active: filters.projectId === null,
    },
    ...(result?.projects ?? []).map((project) => ({
      key: project.id,
      label: `${project.name} (${project.count})`,
      href: myWorkHref(filters, { projectId: project.id }),
      active: filters.projectId === project.id,
    })),
  ];

  const sortOptions: FilterOption[] = MY_WORK_SORTS.map((sortValue) => ({
    key: sortValue,
    label: SORT_LABELS[sortValue],
    href: myWorkHref(filters, { sort: sortValue }),
    active: filters.sort === sortValue,
  }));

  const typeSummary =
    filters.type === "all" ? "Type" : `Type: ${TYPE_LABELS[filters.type]}`;
  const projectSummary = filters.projectId
    ? `Project: ${activeProjectName ?? "Selected"}`
    : "Project";
  const sortSummary =
    filters.sort === "recent" ? "Sort" : `Sort: ${SORT_LABELS[filters.sort]}`;

  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center">
      <form
        role="search"
        action="/my-work"
        method="get"
        className="flex min-w-0 items-center gap-2 md:flex-1"
      >
        {filters.type !== "all" ? (
          <input type="hidden" name="type" value={filters.type} />
        ) : null}
        {filters.projectId ? (
          <input type="hidden" name="project" value={filters.projectId} />
        ) : null}
        {filters.sort !== "recent" ? (
          <input type="hidden" name="sort" value={filters.sort} />
        ) : null}
        <input
          type="search"
          name="q"
          defaultValue={filters.query}
          placeholder="Search titles"
          aria-label="Search my work"
          className="h-11 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20"
        />
        <button
          type="submit"
          className="h-11 shrink-0 rounded-md border border-border/70 bg-background px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Search
        </button>
      </form>
      <div className="flex flex-wrap items-center gap-2">
        <FilterDropdown name="type" summary={typeSummary} options={typeOptions} />
        <FilterDropdown
          name="project"
          summary={projectSummary}
          options={projectOptions}
        />
        <FilterDropdown name="sort" summary={sortSummary} options={sortOptions} />
      </div>
    </div>
  );
}
