"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  Circle,
  ExternalLink,
  ListTodo,
  Maximize2,
  Minimize2,
  RotateCcw,
  Tag,
} from "lucide-react";

import type { ProjectMeetingNotePanelNote } from "@/components/meeting-todos/meeting-note-types";
import { Badge } from "@/components/ui/badge";
import {
  buildProjectMeetingTodos,
  MEETING_TODO_OVERDUE_GRACE_DAYS,
  type ProjectMeetingTodo,
} from "@/lib/meeting-todo";
import { getTaskLabelColor } from "@/lib/task-label";
import { cn } from "@/lib/utils";

interface MeetingTodoSidePanelProps {
  notes: ProjectMeetingNotePanelNote[];
  canEdit: boolean;
  referenceNowMs: number;
  pendingActionId: string | null;
  onOpenMeeting: (note: ProjectMeetingNotePanelNote) => void;
  onSetCompleted: (todo: ProjectMeetingTodo, completed: boolean) => void;
}

function formatMeetingDate(value: string | null): string {
  if (!value) {
    return "No meeting date";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "No meeting date";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function TodoLabels({ labels }: { labels: string[] }) {
  if (labels.length === 0) {
    return <span className="text-xs text-muted-foreground">No labels</span>;
  }

  return (
    <div className="flex min-w-0 flex-wrap gap-1.5">
      {labels.slice(0, 2).map((label) => (
        <span
          key={label}
          className="inline-flex max-w-[8rem] items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-slate-950"
          style={{ backgroundColor: getTaskLabelColor(label) }}
        >
          <Tag className="h-3 w-3 shrink-0" />
          <span className="truncate">{label}</span>
        </span>
      ))}
      {labels.length > 2 ? (
        <span className="rounded-full border border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground">
          +{labels.length - 2}
        </span>
      ) : null}
    </div>
  );
}

function TodoCompletionButton({
  todo,
  canEdit,
  pendingActionId,
  onSetCompleted,
}: {
  todo: ProjectMeetingTodo;
  canEdit: boolean;
  pendingActionId: string | null;
  onSetCompleted: (todo: ProjectMeetingTodo, completed: boolean) => void;
}) {
  const isCompleted = todo.action.completedAt !== null;
  const isPending = pendingActionId === todo.action.id;

  if (!canEdit) {
    return (
      <span className="inline-flex h-8 w-8 items-center justify-center text-muted-foreground">
        {isCompleted ? (
          <Check className="h-4 w-4 text-emerald-600" />
        ) : (
          <Circle className="h-4 w-4" />
        )}
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => onSetCompleted(todo, !isCompleted)}
      aria-label={
        isCompleted
          ? `Reopen todo: ${todo.action.content}`
          : `Complete todo: ${todo.action.content}`
      }
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-wait disabled:opacity-60",
        isCompleted
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-200"
          : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
      )}
    >
      {isCompleted ? <RotateCcw className="h-4 w-4" /> : <Check className="h-4 w-4" />}
    </button>
  );
}

function OpenTodoRow({
  todo,
  canEdit,
  pendingActionId,
  onOpenMeeting,
  onSetCompleted,
}: {
  todo: ProjectMeetingTodo;
  canEdit: boolean;
  pendingActionId: string | null;
  onOpenMeeting: (note: ProjectMeetingNotePanelNote) => void;
  onSetCompleted: (todo: ProjectMeetingTodo, completed: boolean) => void;
}) {
  return (
    <tr
      className={cn(
        "border-b border-border/50 last:border-0",
        todo.isOverdue && "bg-amber-500/[0.08]"
      )}
    >
      <td className="w-10 align-top pl-3 pr-1 pt-3">
        <TodoCompletionButton
          todo={todo}
          canEdit={canEdit}
          pendingActionId={pendingActionId}
          onSetCompleted={onSetCompleted}
        />
      </td>
      <td className="min-w-[13rem] px-2 py-3 align-top">
        <button
          type="button"
          onClick={() => onOpenMeeting(todo.note)}
          className="block min-w-0 text-left"
        >
          <span className="line-clamp-2 text-sm font-medium leading-5 text-foreground">
            {todo.action.content}
          </span>
          <span className="mt-1 inline-flex max-w-full items-center gap-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground">
            <span className="truncate">{todo.note.title}</span>
            <ExternalLink className="h-3 w-3 shrink-0" />
          </span>
        </button>
      </td>
      <td className="hidden min-w-[8.5rem] px-2 py-3 align-top text-xs text-muted-foreground sm:table-cell">
        <span className="inline-flex items-center gap-1">
          <CalendarClock className="h-3.5 w-3.5" />
          {formatMeetingDate(todo.note.scheduledAt)}
        </span>
        {todo.isOverdue ? (
          <Badge
            variant="outline"
            className="mt-2 gap-1 border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-200"
          >
            <AlertTriangle className="h-3 w-3" />
            Overdue
          </Badge>
        ) : null}
      </td>
      <td className="hidden min-w-[8rem] px-2 py-3 align-top sm:table-cell">
        <TodoLabels labels={todo.note.labels} />
      </td>
    </tr>
  );
}

function CompletedTodoRow({
  todo,
  canEdit,
  pendingActionId,
  onOpenMeeting,
  onSetCompleted,
}: {
  todo: ProjectMeetingTodo;
  canEdit: boolean;
  pendingActionId: string | null;
  onOpenMeeting: (note: ProjectMeetingNotePanelNote) => void;
  onSetCompleted: (todo: ProjectMeetingTodo, completed: boolean) => void;
}) {
  return (
    <li className="flex items-start gap-2 rounded-xl border border-border/60 bg-muted/20 p-2.5">
      <TodoCompletionButton
        todo={todo}
        canEdit={canEdit}
        pendingActionId={pendingActionId}
        onSetCompleted={onSetCompleted}
      />
      <button
        type="button"
        onClick={() => onOpenMeeting(todo.note)}
        className="min-w-0 flex-1 text-left"
      >
        <span className="line-clamp-1 text-xs font-medium text-muted-foreground line-through">
          {todo.action.content}
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
          {todo.note.title}
        </span>
      </button>
    </li>
  );
}

export function MeetingTodoSidePanel({
  notes,
  canEdit,
  referenceNowMs,
  pendingActionId,
  onOpenMeeting,
  onSetCompleted,
}: MeetingTodoSidePanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const todos = useMemo(
    () => buildProjectMeetingTodos(notes, referenceNowMs),
    [notes, referenceNowMs]
  );
  const overdueCount = todos.open.filter((todo) => todo.isOverdue).length;

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsCollapsed(true);
      }
    };

    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const content = (
    <aside
      role="region"
      aria-labelledby="meeting-todo-panel-title"
      className={cn(
        "fixed bottom-4 right-4 z-[80] w-[calc(100vw-2rem)] max-w-xl rounded-3xl border border-border/70 bg-background/95 shadow-[0_26px_90px_-36px_rgba(15,23,42,0.75)] backdrop-blur supports-[backdrop-filter]:bg-background/85",
        "print:hidden"
      )}
    >
      {isCollapsed ? (
        <button
          type="button"
          onClick={() => setIsCollapsed(false)}
          className="flex w-full items-center justify-between gap-3 rounded-3xl px-4 py-3 text-left transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          aria-expanded={false}
          aria-controls="meeting-todo-floating-table"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <ListTodo className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span id="meeting-todo-panel-title" className="block text-sm font-semibold">
                Meeting todos
              </span>
              <span className="block text-xs text-muted-foreground">
                {todos.open.length} open
                {overdueCount > 0 ? `, ${overdueCount} overdue` : ""}
              </span>
            </span>
          </span>
          <Maximize2 className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      ) : (
        <div id="meeting-todo-floating-table" className="overflow-hidden rounded-3xl">
          <header className="border-b border-border/60 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <ListTodo className="h-4 w-4" />
                  <h3 id="meeting-todo-panel-title" className="text-sm font-semibold">
                    Meeting todos
                  </h3>
                  <Badge variant="secondary">{todos.open.length} open</Badge>
                  {overdueCount > 0 ? (
                    <Badge
                      variant="outline"
                      className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-200"
                    >
                      {overdueCount} overdue
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Floating follow-ups from every project meeting. Overdue after{" "}
                  {MEETING_TODO_OVERDUE_GRACE_DAYS} days.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCollapsed(true)}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                aria-label="Collapse meeting todos"
                aria-expanded={true}
                aria-controls="meeting-todo-floating-table"
              >
                <Minimize2 className="h-4 w-4" />
              </button>
            </div>
          </header>

          <div className="max-h-[min(34rem,calc(100dvh-8rem))] overflow-y-auto">
            {todos.open.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full table-auto text-left">
                  <caption className="sr-only">Open meeting todos across this project</caption>
                  <thead className="sticky top-0 z-10 bg-muted/80 text-[11px] uppercase tracking-[0.14em] text-muted-foreground backdrop-blur">
                    <tr>
                      <th scope="col" className="w-10 px-3 py-2">
                        <span className="sr-only">Status</span>
                      </th>
                      <th scope="col" className="px-2 py-2 font-semibold">
                        Todo
                      </th>
                      <th scope="col" className="hidden px-2 py-2 font-semibold sm:table-cell">
                        Meeting date
                      </th>
                      <th scope="col" className="hidden px-2 py-2 font-semibold sm:table-cell">
                        Labels
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {todos.open.map((todo) => (
                      <OpenTodoRow
                        key={todo.action.id}
                        todo={todo}
                        canEdit={canEdit}
                        pendingActionId={pendingActionId}
                        onOpenMeeting={onOpenMeeting}
                        onSetCompleted={onSetCompleted}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-5 py-8 text-center">
                <Check className="mx-auto h-8 w-8 text-emerald-600" />
                <p className="mt-3 text-sm font-medium">All caught up.</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  New meeting follow-ups will appear here.
                </p>
              </div>
            )}

            {todos.completed.length > 0 ? (
              <section className="border-t border-border/60 bg-muted/10 px-4 py-3">
                <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Recently completed
                </h4>
                <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                  {todos.completed.slice(0, 4).map((todo) => (
                    <CompletedTodoRow
                      key={todo.action.id}
                      todo={todo}
                      canEdit={canEdit}
                      pendingActionId={pendingActionId}
                      onOpenMeeting={onOpenMeeting}
                      onSetCompleted={onSetCompleted}
                    />
                  ))}
                </ul>
              </section>
            ) : null}
          </div>

          {!canEdit ? (
            <footer className="border-t border-border/60 bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
              View-only access: owners and editors can update meeting todos.
            </footer>
          ) : null}
        </div>
      )}
    </aside>
  );

  return typeof document === "undefined"
    ? content
    : createPortal(content, document.body);
}
