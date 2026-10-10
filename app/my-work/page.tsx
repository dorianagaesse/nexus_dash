import { unstable_noStore as noStore } from "next/cache";

import {
  MY_WORK_DEFAULT_FILTERS,
  MyWorkFilters,
  type MyWorkFilterState,
} from "@/components/my-work/my-work-filters";
import { MyWorkList } from "@/components/my-work/my-work-list";
import { requireVerifiedSessionUserIdFromServer } from "@/lib/auth/server-guard";
import { logServerError } from "@/lib/observability/logger";
import {
  isMyWorkSort,
  isMyWorkTypeFilter,
  listMyWork,
  type MyWorkResult,
} from "@/lib/services/my-work-service";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function readQueryValue(value: string | string[] | undefined): string | null {
  if (!value) {
    return null;
  }
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value;
}

function parseFilters(
  searchParams: SearchParams | undefined
): MyWorkFilterState {
  const typeParam = readQueryValue(searchParams?.type)?.trim() ?? "";
  const sortParam = readQueryValue(searchParams?.sort)?.trim() ?? "";
  return {
    type: isMyWorkTypeFilter(typeParam)
      ? typeParam
      : MY_WORK_DEFAULT_FILTERS.type,
    projectId: readQueryValue(searchParams?.project)?.trim() || null,
    query: readQueryValue(searchParams?.q)?.trim() ?? "",
    sort: isMyWorkSort(sortParam) ? sortParam : MY_WORK_DEFAULT_FILTERS.sort,
  };
}

export default async function MyWorkPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  noStore();
  const [resolvedSearchParams, actorUserId] = await Promise.all([
    searchParams,
    requireVerifiedSessionUserIdFromServer(),
  ]);
  const filters = parseFilters(resolvedSearchParams);

  let result: MyWorkResult | null = null;
  let loadError: string | null = null;
  try {
    result = await listMyWork({ actorUserId, ...filters });
  } catch (error) {
    logServerError("MyWorkPage.listMyWork", error, {
      type: filters.type,
      sort: filters.sort,
    });
    loadError = "Could not load your work. Refresh to retry.";
  }

  const hasActiveFilters =
    filters.type !== MY_WORK_DEFAULT_FILTERS.type ||
    filters.projectId !== MY_WORK_DEFAULT_FILTERS.projectId ||
    filters.query !== MY_WORK_DEFAULT_FILTERS.query ||
    filters.sort !== MY_WORK_DEFAULT_FILTERS.sort;

  const now = new Date();

  return (
    <main className="container py-10 sm:py-16">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">My work</h1>
          {result ? (
            <span
              data-my-work-total
              className="text-sm tabular-nums text-muted-foreground"
            >
              {result.total}
              {result.truncated ? "+" : ""}{" "}
              {result.total === 1 && !result.truncated ? "item" : "items"}
            </span>
          ) : null}
        </div>

        <MyWorkFilters filters={filters} result={result} />

        {loadError ? (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {loadError}
          </div>
        ) : null}

        {result ? (
          <MyWorkList
            result={result}
            hasActiveFilters={hasActiveFilters}
            now={now}
          />
        ) : null}
      </div>
    </main>
  );
}
