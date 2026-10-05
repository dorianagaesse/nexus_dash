import { unstable_noStore as noStore } from "next/cache";

import { MyWorkSection } from "@/components/my-work/my-work-section";
import { MyWorkTabs } from "@/components/my-work/my-work-tabs";
import { requireVerifiedSessionUserIdFromServer } from "@/lib/auth/server-guard";
import { logServerError } from "@/lib/observability/logger";
import {
  isMyWorkView,
  listMyWork,
  type MyWorkResult,
  type MyWorkView,
} from "@/lib/services/my-work-service";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

const VIEW_DESCRIPTIONS: Record<MyWorkView, string> = {
  assigned:
    "Open tasks, meeting todos, and meeting notes assigned or stewarded to you across your projects.",
  unassigned:
    "Open work with no assignee or steward, ready to be picked up.",
  reassignment:
    "Work still assigned to a deactivated member, a revoked agent credential, or a departed guest.",
  recent: "The most recently updated work across your projects.",
};

function readQueryValue(value: string | string[] | undefined): string | null {
  if (!value) {
    return null;
  }
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value;
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
  const viewParam = readQueryValue(resolvedSearchParams?.view)?.trim() ?? "";
  const view: MyWorkView = isMyWorkView(viewParam) ? viewParam : "assigned";

  let result: MyWorkResult | null = null;
  let loadError: string | null = null;
  try {
    result = await listMyWork({ actorUserId, view });
  } catch (error) {
    logServerError("MyWorkPage.listMyWork", error, { view });
    loadError = "Could not load your work. Refresh to retry.";
  }

  const now = new Date();

  return (
    <main className="container py-10 sm:py-16">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">My work</h1>
          <p className="text-sm text-muted-foreground">{VIEW_DESCRIPTIONS[view]}</p>
        </div>

        <MyWorkTabs activeView={view} />

        {loadError ? (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {loadError}
          </div>
        ) : null}

        {result ? (
          <div className="space-y-8">
            <MyWorkSection
              name="tasks"
              title="Kanban tasks"
              emptyMessage="No kanban tasks in this view."
              section={result.tasks}
              now={now}
            />
            <MyWorkSection
              name="todos"
              title="Meeting todos"
              emptyMessage="No meeting todos in this view."
              section={result.todos}
              now={now}
            />
            <MyWorkSection
              name="notes"
              title="Meeting notes"
              emptyMessage="No meeting notes in this view."
              section={result.notes}
              now={now}
            />
          </div>
        ) : null}
      </div>
    </main>
  );
}
