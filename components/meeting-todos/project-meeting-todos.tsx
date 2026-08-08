"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  CheckCircle2,
  Circle,
  ExternalLink,
  LoaderCircle,
  RotateCcw,
} from "lucide-react";

import {
  MeetingTodoAssigneeChip,
  MeetingTodoAssigneeChipReadonly,
} from "@/components/meeting-todos/meeting-todo-assignee-chip";
import { MeetingTodoActorIdentity } from "@/components/meeting-todos/meeting-todo-actor-control";
import { Badge } from "@/components/ui/badge";
import { isMeetingTodoOverdueAt } from "@/lib/meeting-todo";
import {
  type MeetingTodoActorReference,
  type MeetingTodoActorSummary,
} from "@/lib/meeting-todo-actor";
import { fetchProjectActivityMutation } from "@/lib/project-activity-client";
import { cn } from "@/lib/utils";

export interface ProjectMeetingTodoItem {
  id: string;
  content: string;
  completedAt: string | null;
  updatedAt: string;
  isOverdue: boolean;
  creator?: MeetingTodoActorSummary | null;
  assignee?: MeetingTodoActorSummary | null;
  completedBy?: MeetingTodoActorSummary | null;
  meeting: {
    id: string;
    title: string;
    scheduledAt: string | null;
    status: string;
  };
}

interface ProjectMeetingTodosProps {
  projectId: string;
  canEdit: boolean;
  currentActorUserId?: string;
  actors?: MeetingTodoActorSummary[];
  initialTodos: ProjectMeetingTodoItem[];
  loadError?: string | null;
}

type TodoView = "open" | "completed";
type ResponsibilityView = "all" | "mine" | "unassigned";

function normalizeView(value: string | null): TodoView {
  return value === "completed" ? "completed" : "open";
}

function normalizeResponsibility(value: string | null): ResponsibilityView {
  return value === "mine" || value === "unassigned" ? value : "all";
}

function buildTodosHref(
  projectId: string,
  view: TodoView,
  responsibility: ResponsibilityView
): string {
  const searchParams = new URLSearchParams();
  if (view === "completed") {
    searchParams.set("view", view);
  }
  if (responsibility !== "all") {
    searchParams.set("responsibility", responsibility);
  }

  const query = searchParams.toString();
  const pathname = `/projects/${projectId}/todos`;
  return query ? `${pathname}?${query}` : pathname;
}

function formatMeetingDate(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function TodoCompletionControl({
  todo,
  canEdit,
  isPending,
  onSetCompleted,
}: {
  todo: ProjectMeetingTodoItem;
  canEdit: boolean;
  isPending: boolean;
  onSetCompleted: (todo: ProjectMeetingTodoItem, completed: boolean) => void;
}) {
  const isCompleted = todo.completedAt !== null;

  if (!canEdit) {
    return (
      <span
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-border bg-muted/40 text-muted-foreground"
        title="View-only project"
      >
        {isCompleted ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden />
        ) : (
          <Circle className="h-5 w-5" aria-hidden />
        )}
        <span className="sr-only">
          {isCompleted ? "Completed todo" : "Open todo"}, view only
        </span>
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => onSetCompleted(todo, !isCompleted)}
      aria-label={`${isCompleted ? "Reopen" : "Complete"} todo: ${todo.content}`}
      className={cn(
        "grid h-11 w-11 shrink-0 touch-manipulation place-items-center rounded-full border transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-wait disabled:opacity-60",
        isCompleted
          ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-200"
          : "border-border bg-background text-muted-foreground hover:border-primary/45 hover:bg-primary/5 hover:text-foreground"
      )}
    >
      {isPending ? (
        <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden />
      ) : isCompleted ? (
        <RotateCcw className="h-5 w-5" aria-hidden />
      ) : (
        <Check className="h-5 w-5" aria-hidden />
      )}
    </button>
  );
}

function TodoRow({
  todo,
  projectId,
  canEdit,
  isPending,
  onSetCompleted,
  actors,
  onSetAssignee,
}: {
  todo: ProjectMeetingTodoItem;
  projectId: string;
  canEdit: boolean;
  isPending: boolean;
  onSetCompleted: (todo: ProjectMeetingTodoItem, completed: boolean) => void;
  actors: MeetingTodoActorSummary[];
  onSetAssignee: (
    todo: ProjectMeetingTodoItem,
    assignee: MeetingTodoActorReference | null
  ) => void;
}) {
  const meetingDate = formatMeetingDate(todo.meeting.scheduledAt);
  const isCompleted = todo.completedAt !== null;
  const meetingHref = `/projects/${projectId}?meetingNoteId=${encodeURIComponent(
    todo.meeting.id
  )}&meetingTodoId=${encodeURIComponent(todo.id)}`;

  return (
    <li
      className={cn(
        "flex gap-3 border-t border-border/60 px-4 py-4 first:border-t-0 sm:px-5",
        todo.isOverdue && "bg-amber-500/[0.07]"
      )}
    >
      <TodoCompletionControl
        todo={todo}
        canEdit={canEdit}
        isPending={isPending}
        onSetCompleted={onSetCompleted}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
          <p
            className={cn(
              "min-w-0 flex-1 break-words text-sm font-medium leading-6 text-foreground [overflow-wrap:anywhere] sm:text-[15px]",
              isCompleted && "text-muted-foreground line-through"
            )}
          >
            {todo.content}
          </p>
          {canEdit ? (
            <MeetingTodoAssigneeChip
              id={`project-todo-assignee-${todo.id}`}
              value={todo.assignee ?? null}
              options={actors}
              onChange={(assignee) => onSetAssignee(todo, assignee)}
              disabled={isPending}
              pending={isPending}
            />
          ) : (
            <MeetingTodoAssigneeChipReadonly actor={todo.assignee ?? null} />
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
          <Link
            href={meetingHref}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg py-2 font-medium underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="max-w-[16rem] truncate">{todo.meeting.title}</span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
          </Link>
          {meetingDate ? (
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden />
              {meetingDate}
            </span>
          ) : null}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-2">
          {todo.isOverdue ? (
            <Badge
              variant="outline"
              className="gap-1 border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-200"
            >
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
              Overdue
            </Badge>
          ) : null}
          {!canEdit ? <Badge variant="secondary">View only</Badge> : null}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
          <MeetingTodoActorIdentity
            actor={todo.creator ?? null}
            prefix="Created by"
            compact
          />
          {isCompleted ? (
            <MeetingTodoActorIdentity
              actor={todo.completedBy ?? null}
              prefix="Completed by"
              compact
            />
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function ProjectMeetingTodos({
  projectId,
  canEdit,
  currentActorUserId = "",
  actors = [],
  initialTodos,
  loadError = null,
}: ProjectMeetingTodosProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = normalizeView(searchParams.get("view"));
  const responsibility = normalizeResponsibility(
    searchParams.get("responsibility")
  );
  const [todos, setTodos] = useState(initialTodos);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  useEffect(() => {
    setTodos(initialTodos);
  }, [initialTodos]);

  const openTodos = useMemo(
    () => todos.filter((todo) => todo.completedAt === null),
    [todos]
  );
  const completedTodos = useMemo(
    () => todos.filter((todo) => todo.completedAt !== null),
    [todos]
  );
  const overdueCount = useMemo(
    () => openTodos.filter((todo) => todo.isOverdue).length,
    [openTodos]
  );
  const responsibilityMatches = (todo: ProjectMeetingTodoItem) => {
    if (responsibility === "mine") {
      return (
        todo.assignee?.kind === "human" &&
        todo.assignee.id === currentActorUserId &&
        todo.assignee.status === "active"
      );
    }
    if (responsibility === "unassigned") {
      return todo.assignee === null;
    }
    return true;
  };
  const sourceTodos = (view === "completed" ? completedTodos : openTodos).filter(
    responsibilityMatches
  );
  const responsibilityCounts = {
    all: (view === "completed" ? completedTodos : openTodos).length,
    mine: (view === "completed" ? completedTodos : openTodos).filter(
      (todo) =>
        todo.assignee?.kind === "human" &&
        todo.assignee.id === currentActorUserId &&
        todo.assignee.status === "active"
    ).length,
    unassigned: (view === "completed" ? completedTodos : openTodos).filter(
      (todo) => todo.assignee === null
    ).length,
  };

  const setTodoCompleted = async (
    todo: ProjectMeetingTodoItem,
    completed: boolean
  ) => {
    if (!canEdit || pendingActionId) {
      return;
    }

    setPendingActionId(todo.id);
    setMutationError(null);
    setFeedback(null);

    try {
      const response = await fetchProjectActivityMutation(
        projectId,
        `/api/projects/${projectId}/meeting-notes/${todo.meeting.id}/actions/${todo.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ completed }),
        }
      );
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "meeting-todo-update-failed");
      }

      const updatedAt = new Date().toISOString();
      setTodos((current) =>
        current.map((entry) =>
          entry.id === todo.id
            ? {
                ...entry,
                completedAt: completed ? updatedAt : null,
                updatedAt,
                isOverdue: completed
                  ? false
                  : isMeetingTodoOverdueAt({
                      scheduledAt: entry.meeting.scheduledAt,
                      completedAt: null,
                      meetingStatus: entry.meeting.status,
                      referenceNowMs: Date.now(),
                    }),
              }
            : entry
        )
      );
      setFeedback(completed ? "Todo completed." : "Todo reopened.");
      router.refresh();
    } catch {
      setMutationError(
        "Could not update this todo. Check your access and retry."
      );
    } finally {
      setPendingActionId(null);
    }
  };

  const setTodoAssignee = async (
    todo: ProjectMeetingTodoItem,
    assignee: MeetingTodoActorReference | null
  ) => {
    if (!canEdit || pendingActionId) {
      return;
    }

    setPendingActionId(todo.id);
    setMutationError(null);
    setFeedback(null);
    try {
      const response = await fetchProjectActivityMutation(
        projectId,
        `/api/projects/${projectId}/meeting-notes/${todo.meeting.id}/actions/${todo.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assignee }),
        }
      );
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "meeting-todo-update-failed");
      }

      const selected = assignee
        ? actors.find(
            (actor) =>
              actor.kind === assignee.kind && actor.id === assignee.id
          ) ?? null
        : null;
      setTodos((current) =>
        current.map((entry) =>
          entry.id === todo.id
            ? { ...entry, assignee: selected, updatedAt: new Date().toISOString() }
            : entry
        )
      );
      setFeedback(selected ? `Assigned to ${selected.displayName}.` : "Todo unassigned.");
      router.refresh();
    } catch {
      setMutationError(
        "Could not update this assignee. The actor may no longer have project access."
      );
    } finally {
      setPendingActionId(null);
    }
  };

  return (
    <div className="space-y-6">
      <section
        aria-label="Todo summary"
        className="grid grid-cols-2 gap-3 sm:max-w-xl"
      >
        <div className="rounded-2xl border border-border/70 bg-card/70 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Open
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {openTodos.length}
          </p>
        </div>
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-200">
            Overdue
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-amber-700 dark:text-amber-100">
            {overdueCount}
          </p>
        </div>
      </section>

      <div className="rounded-2xl border border-border/70 bg-card/70 p-3 sm:p-4">
        <nav
          aria-label="Todo views"
          className="grid max-w-md grid-cols-2 rounded-xl bg-muted/70 p-1"
        >
          {(["open", "completed"] as const).map((itemView) => {
            const isCurrent = view === itemView;
            const count =
              itemView === "open" ? openTodos.length : completedTodos.length;
            return (
              <Link
                key={itemView}
                href={buildTodosHref(projectId, itemView, responsibility)}
                aria-current={isCurrent ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 min-w-0 touch-manipulation items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium capitalize transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isCurrent
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {itemView}
                <span className="tabular-nums text-xs">{count}</span>
              </Link>
            );
          })}
        </nav>
        <nav
          aria-label="Todo responsibility"
          className="mt-3 grid grid-cols-1 gap-1 rounded-xl bg-muted/40 p-1 sm:grid-cols-3"
        >
          {(
            [
              ["all", "All"],
              ["mine", "Assigned to me"],
              ["unassigned", "Unassigned"],
            ] as const
          ).map(([itemResponsibility, label]) => {
            const isCurrent = responsibility === itemResponsibility;
            return (
              <Link
                key={itemResponsibility}
                href={buildTodosHref(projectId, view, itemResponsibility)}
                aria-current={isCurrent ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isCurrent
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
                <span className="tabular-nums text-xs">
                  {responsibilityCounts[itemResponsibility]}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div aria-live="polite" aria-atomic="true">
        {feedback ? (
          <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-200">
            {feedback}
          </div>
        ) : null}
      </div>
      {loadError || mutationError ? (
        <div
          role="alert"
          className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {mutationError ?? loadError}
        </div>
      ) : null}

      {sourceTodos.length > 0 ? (
        <section
          aria-label={`${view === "open" ? "Open" : "Completed"} meeting todos`}
          className="overflow-hidden rounded-2xl border border-border/70 bg-card/80"
        >
          <ul>
            {sourceTodos.map((todo) => (
              <TodoRow
                key={todo.id}
                todo={todo}
                projectId={projectId}
                canEdit={canEdit}
                isPending={pendingActionId === todo.id}
                onSetCompleted={(entry, completed) => {
                  void setTodoCompleted(entry, completed);
                }}
                actors={actors}
                onSetAssignee={(entry, assignee) => {
                  void setTodoAssignee(entry, assignee);
                }}
              />
            ))}
          </ul>
        </section>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-card/55 px-6 py-12 text-center">
          <CheckCircle2
            className="mx-auto h-10 w-10 text-emerald-600"
            aria-hidden
          />
          <h2 className="mt-4 text-base font-semibold">
            {responsibility === "mine"
              ? "Nothing assigned to you"
              : responsibility === "unassigned"
                ? "No unassigned todos"
                : view === "open"
                  ? "All caught up"
                  : "No completed todos yet"}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            {responsibility === "mine"
              ? `There are no ${view} meeting todos assigned to you.`
              : responsibility === "unassigned"
                ? `There are no ${view} meeting todos waiting for an assignee.`
                : view === "open"
                  ? "There are no open meeting todos in this project."
                  : "This project has no completed meeting todos."}
          </p>
        </div>
      )}
    </div>
  );
}
