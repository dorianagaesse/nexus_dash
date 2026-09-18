"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, History, RefreshCcw } from "lucide-react";

import {
  PROJECT_SECTION_CARD_CLASS,
  PROJECT_SECTION_CONTENT_CLASS,
  PROJECT_SECTION_HEADER_CLASS,
} from "@/components/project-dashboard/project-section-chrome";
import {
  buildProjectTimelineRequestUrl,
  formatProjectTimelineChangeValue,
  formatProjectTimelineTimestamp,
  PROJECT_TIMELINE_ACTOR_STATUS_LABEL,
  type ProjectTimelineEntry,
  type ProjectTimelinePage,
} from "@/components/project-timeline-panel-utils";
import { AgentAvatar } from "@/components/ui/agent-avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useProjectSectionExpanded } from "@/lib/hooks/use-project-section-expanded";
import { cn } from "@/lib/utils";

interface ProjectTimelinePanelProps {
  projectId: string;
}

export function ProjectTimelinePanel({ projectId }: ProjectTimelinePanelProps) {
  const { isExpanded, setIsExpanded } = useProjectSectionExpanded({
    projectId,
    sectionKey: "timeline",
    defaultExpanded: false,
    logLabel: "ProjectTimelinePanel",
  });
  const [entries, setEntries] = useState<ProjectTimelineEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTimeline = useCallback(
    async (options?: {
      cursor?: string | null;
      append?: boolean;
      signal?: AbortSignal;
    }) => {
      const append = options?.append === true;
      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      try {
        const response = await fetch(
          buildProjectTimelineRequestUrl({
            projectId,
            cursor: options?.cursor ?? null,
          }),
          {
            method: "GET",
            cache: "no-store",
            signal: options?.signal,
          }
        );
        const payload = (await response.json().catch(() => null)) as
          | (ProjectTimelinePage & { error?: string })
          | null;

        if (!response.ok || !payload) {
          throw new Error(payload?.error ?? "Could not load project history.");
        }

        setEntries((current) =>
          append
            ? [...current, ...(payload.entries ?? [])]
            : (payload.entries ?? [])
        );
        setNextCursor(payload.nextCursor ?? null);
      } catch (fetchError) {
        if (fetchError instanceof Error && fetchError.name === "AbortError") {
          return;
        }

        console.error("[ProjectTimelinePanel.loadTimeline]", fetchError);
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Could not load project history."
        );
      } finally {
        if (append) {
          setIsLoadingMore(false);
        } else {
          setIsLoading(false);
        }
      }
    },
    [projectId]
  );

  useEffect(() => {
    if (!isExpanded) {
      return;
    }

    const controller = new AbortController();
    void loadTimeline({ signal: controller.signal });

    return () => {
      controller.abort();
    };
  }, [isExpanded, loadTimeline]);

  return (
    <Card className={PROJECT_SECTION_CARD_CLASS}>
      <CardHeader
        className={cn(
          `space-y-3 ${PROJECT_SECTION_HEADER_CLASS} px-5 pt-5`,
          isExpanded ? "pb-4" : "pb-3"
        )}
      >
        <button
          type="button"
          onClick={() => setIsExpanded((previous) => !previous)}
          aria-expanded={isExpanded}
          className="flex min-w-0 w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition hover:bg-muted/40"
        >
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
          <div className="min-w-0 space-y-1">
            <CardTitle className="text-lg font-semibold tracking-tight">
              <span className="inline-flex items-center gap-2">
                <History className="h-4 w-4 text-muted-foreground" />
                Timeline
              </span>
            </CardTitle>
          </div>
        </button>
      </CardHeader>

      {isExpanded ? (
        <CardContent className={cn("space-y-4", PROJECT_SECTION_CONTENT_CLASS)}>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void loadTimeline()}
              disabled={isLoading}
            >
              <RefreshCcw className="h-4 w-4" />
              Refresh
            </Button>
          </div>

          {isLoading ? (
            <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
              Loading timeline...
            </div>
          ) : null}

          {!isLoading && error ? (
            <div className="space-y-3 rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <p>{error}</p>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => void loadTimeline()}
              >
                Retry
              </Button>
            </div>
          ) : null}

          {!isLoading && !error && entries.length === 0 ? (
            <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
              No activity recorded yet.
            </div>
          ) : null}

          {!error && entries.length > 0 ? (
            <ol className="space-y-3">
              {entries.map((entry) => {
                const actorStatusLabel = entry.actor
                  ? PROJECT_TIMELINE_ACTOR_STATUS_LABEL[entry.actor.status]
                  : null;

                return (
                  <li
                    key={entry.id}
                    data-timeline-entry={entry.id}
                    className="space-y-2 rounded-xl border border-border/60 bg-muted/20 px-3 py-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                      {entry.actor ? (
                        <span className="inline-flex min-w-0 items-center gap-1.5 text-foreground">
                          {entry.actor.kind === "agent" ? (
                            <AgentAvatar
                              displayName={entry.actor.displayName}
                              decorative
                              className="h-4 w-4"
                            />
                          ) : (
                            <UserAvatar
                              avatarSeed={entry.actor.avatarSeed ?? entry.actor.id}
                              displayName={entry.actor.displayName}
                              decorative
                              className="h-4 w-4"
                            />
                          )}
                          <span className="truncate font-medium">
                            {entry.actor.displayName}
                          </span>
                          {actorStatusLabel ? (
                            <span className="truncate text-muted-foreground">
                              · {actorStatusLabel}
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="truncate">Unknown actor</span>
                      )}
                      <time dateTime={entry.version} className="shrink-0">
                        {formatProjectTimelineTimestamp(entry.version)}
                      </time>
                    </div>

                    <p className="text-sm font-medium text-foreground">
                      {entry.summary ??
                        entry.entityDisplayNameSnapshot ??
                        entry.entityId}
                    </p>

                    {entry.changes?.length ? (
                      <ul className="flex flex-wrap gap-1.5">
                        {entry.changes.map((change, index) => (
                          <li
                            key={`${change.field}-${index}`}
                            className="rounded-full border border-border/60 bg-background/60 px-2 py-0.5 text-[11px] text-muted-foreground"
                          >
                            {change.field}:{" "}
                            {formatProjectTimelineChangeValue(change.before)} →{" "}
                            {formatProjectTimelineChangeValue(change.after)}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          ) : null}

          {!error && nextCursor ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                void loadTimeline({ cursor: nextCursor, append: true })
              }
              disabled={isLoadingMore}
              className="w-full sm:w-auto"
            >
              {isLoadingMore ? "Loading..." : "Load more"}
            </Button>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  );
}
