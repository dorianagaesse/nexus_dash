"use client";

import { useMemo, useRef, type MouseEvent } from "react";
import Link from "next/link";
import { X } from "lucide-react";

import { AgentAvatar } from "@/components/ui/agent-avatar";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { TaskAuthorSummary } from "@/lib/task-author";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { EpicTaskSummary, ProjectEpicSnapshot } from "@/lib/epic";
import { requestTaskOpen, synchronizeTaskUrl } from "@/lib/task-open-client";
import { formatTaskReference } from "@/lib/task-reference";
import { cn } from "@/lib/utils";

function formatEpicActivityDate(value: string): string {
  return new Date(value).toLocaleDateString();
}

function EpicAuthorInline({
  label,
  author,
  timestamp,
}: {
  label: string;
  author: TaskAuthorSummary;
  timestamp: string;
}) {
  return (
    <span
      className="inline-flex min-w-0 max-w-full items-center gap-1.5"
      title={`${label}: ${author.usernameTag ?? author.displayName}`}
    >
      {author.kind === "agent" ? (
        <AgentAvatar
          displayName={author.displayName}
          decorative
          className="h-5 w-5 shrink-0 border-border/70"
        />
      ) : (
        <UserAvatar
          avatarSeed={author.avatarSeed}
          displayName={author.displayName}
          decorative
          className="h-5 w-5 shrink-0 border-border/70"
        />
      )}
      <span className="min-w-0 truncate">
        {label}{" "}
        <span className="font-medium text-foreground">
          {author.displayName}
        </span>{" "}
        {/* Server and browser locales can format the date differently; keep the
            client's formatting without tripping a hydration mismatch. */}
        <time
          dateTime={timestamp}
          suppressHydrationWarning
          className="text-muted-foreground/80"
        >
          {formatEpicActivityDate(timestamp)}
        </time>
      </span>
    </span>
  );
}

const TASK_COMPLETION_ORDER: Record<string, number> = {
  Backlog: 0,
  Blocked: 1,
  "In Progress": 2,
  Done: 3,
};

interface EpicDetailsDialogProps {
  projectId: string;
  epic: ProjectEpicSnapshot;
  onClose: () => void;
  onReturnFocus: () => void;
}

export function EpicDetailsDialog({
  projectId,
  epic,
  onClose,
  onReturnFocus,
}: EpicDetailsDialogProps) {
  const openingTaskRef = useRef(false);
  const tasks = useMemo(
    () =>
      [...epic.linkedTasks].sort((left, right) => {
        const leftOrder = left.archivedAt ? 3 : (TASK_COMPLETION_ORDER[left.status] ?? 4);
        const rightOrder = right.archivedAt ? 3 : (TASK_COMPLETION_ORDER[right.status] ?? 4);
        return leftOrder - rightOrder;
      }),
    [epic.linkedTasks]
  );

  const openTask = (event: MouseEvent<HTMLAnchorElement>, task: EpicTaskSummary) => {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    openingTaskRef.current = true;
    if (requestTaskOpen(task.id)) {
      event.preventDefault();
      synchronizeTaskUrl(task.id);
    }
    onClose();
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        className="flex max-h-[100dvh] w-full max-w-2xl flex-col overflow-hidden sm:max-h-[calc(100dvh-2rem)] sm:rounded-2xl"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (!openingTaskRef.current) onReturnFocus();
        }}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border/60 px-4 py-3 sm:px-6">
          <div className="min-w-0 py-2">
            <DialogTitle className="break-words text-lg [overflow-wrap:anywhere]">
              {epic.name}
            </DialogTitle>
            <p className="mt-1 text-sm tabular-nums text-muted-foreground">
              {epic.progressPercent}% complete · {epic.completedTaskCount} of {epic.taskCount} tasks completed
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-11 w-11 shrink-0"
            onClick={onClose}
            aria-label="Close epic details"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
        <div className="min-h-0 space-y-6 overflow-y-auto overscroll-y-contain px-4 py-4 sm:px-6">
          <section aria-label="Description" className="space-y-2">
            <h3 className="text-sm font-semibold">Description</h3>
            <p className="whitespace-pre-wrap break-words text-sm leading-6 [overflow-wrap:anywhere]">
              {epic.description}
            </p>
          </section>
          <section aria-labelledby="epic-linked-tasks-heading" className="space-y-2">
            <h3 id="epic-linked-tasks-heading" className="text-sm font-semibold">
              Linked tasks ({epic.taskCount})
            </h3>
            {tasks.length ? (
              <ul className="divide-y divide-border/60">
                {tasks.map((task) => (
                  <li key={task.id} className="min-w-0">
                    <Link
                      href={`/projects/${projectId}/tasks/${task.id}`}
                      prefetch={false}
                      title={task.title}
                      onClick={(event) => openTask(event, task)}
                      className="grid min-h-11 grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-1 rounded-md px-2 py-3 text-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[auto_minmax(0,1fr)_auto]"
                    >
                      <span className="shrink-0 font-mono text-xs font-medium leading-6 text-muted-foreground">
                        {formatTaskReference(task.referenceNumber)}
                      </span>
                      <span
                        data-task-title
                        className="col-span-2 row-start-2 min-w-0 break-words leading-6 [overflow-wrap:anywhere] sm:col-span-1 sm:col-start-2 sm:row-start-1"
                      >
                        {task.title}
                      </span>
                      <span className={cn(
                        "col-start-2 row-start-1 justify-self-end rounded px-2 py-0.5 text-xs font-medium leading-5 sm:col-start-3",
                        task.archivedAt || task.status === "Done"
                          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"
                          : task.status === "Blocked"
                            ? "bg-amber-500/10 text-amber-800 dark:text-amber-200"
                            : task.status === "In Progress"
                              ? "bg-sky-500/10 text-sky-700 dark:text-sky-200"
                              : "bg-muted text-muted-foreground"
                      )}>
                        {task.archivedAt ? "Archived" : task.status}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No tasks linked yet.</p>
            )}
          </section>
          <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-border/60 pt-4 text-xs text-muted-foreground">
            <EpicAuthorInline label="Created by" author={epic.createdBy} timestamp={epic.createdAt} />
            <EpicAuthorInline label="Last edited by" author={epic.updatedBy} timestamp={epic.updatedAt} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
