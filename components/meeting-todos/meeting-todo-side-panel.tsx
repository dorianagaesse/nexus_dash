"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef } from "react";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  Circle,
  ExternalLink,
  ListTodo,
  RotateCcw,
  Tag,
  X,
} from "lucide-react";

import type { ProjectMeetingNotePanelNote } from "@/components/meeting-todos/meeting-note-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  buildProjectMeetingTodos,
  MEETING_TODO_OVERDUE_GRACE_DAYS,
  type ProjectMeetingTodo,
} from "@/lib/meeting-todo";
import { getTaskLabelColor } from "@/lib/task-label";
import { cn } from "@/lib/utils";

interface MeetingTodoSidePanelProps {
  isOpen: boolean;
  notes: ProjectMeetingNotePanelNote[];
  canEdit: boolean;
  referenceNowMs: number;
  pendingActionId: string | null;
  onClose: () => void;
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
    return null;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {labels.slice(0, 3).map((label) => (
        <span
          key={label}
          className="inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-slate-950"
          style={{ backgroundColor: getTaskLabelColor(label) }}
        >
          <Tag className="h-3 w-3 shrink-0" />
          <span className="truncate">{label}</span>
        </span>
      ))}
      {labels.length > 3 ? (
        <span className="rounded-full border border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground">
          +{labels.length - 3}
        </span>
      ) : null}
    </div>
  );
}

function TodoRow({
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
  const isCompleted = todo.action.completedAt !== null;
  const isPending = pendingActionId === todo.action.id;

  return (
    <article
      className={cn(
        "space-y-3 border-b border-border/60 px-5 py-4 last:border-b-0 sm:px-6",
        todo.isOverdue && "bg-amber-500/[0.07]"
      )}
    >
      <div className="flex items-start gap-3">
        {canEdit ? (
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
              "mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-wait disabled:opacity-60",
              isCompleted
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-200"
                : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
            )}
          >
            {isCompleted ? (
              <RotateCcw className="h-4 w-4" />
            ) : (
              <Check className="h-4 w-4" />
            )}
          </button>
        ) : (
          <span className="mt-2 text-muted-foreground">
            {isCompleted ? (
              <Check className="h-4 w-4 text-emerald-600" />
            ) : (
              <Circle className="h-4 w-4" />
            )}
          </span>
        )}

        <button
          type="button"
          onClick={() => onOpenMeeting(todo.note)}
          className="min-w-0 flex-1 text-left"
        >
          <span
            className={cn(
              "block text-sm font-medium leading-6 text-foreground",
              isCompleted && "text-muted-foreground line-through"
            )}
          >
            {todo.action.content}
          </span>
          <span className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground">
            {todo.note.title}
            <ExternalLink className="h-3 w-3" />
          </span>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 pl-11 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <CalendarClock className="h-3.5 w-3.5" />
          {formatMeetingDate(todo.note.scheduledAt)}
        </span>
        {todo.isOverdue ? (
          <Badge
            variant="outline"
            className="gap-1 border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-200"
          >
            <AlertTriangle className="h-3 w-3" />
            Overdue
          </Badge>
        ) : null}
      </div>

      <div className="pl-11">
        <TodoLabels labels={todo.note.labels} />
      </div>
    </article>
  );
}

export function MeetingTodoSidePanel({
  isOpen,
  notes,
  canEdit,
  referenceNowMs,
  pendingActionId,
  onClose,
  onOpenMeeting,
  onSetCompleted,
}: MeetingTodoSidePanelProps) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const todos = useMemo(
    () => buildProjectMeetingTodos(notes, referenceNowMs),
    [notes, referenceNowMs]
  );

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleEscape);
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const content = (
    <div className="fixed inset-0 z-[100]">
      <button
        type="button"
        aria-label="Close meeting todos"
        className="absolute inset-0 h-full w-full bg-black/65"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="meeting-todo-panel-title"
        className="absolute inset-y-0 right-0 flex h-dvh w-full max-w-lg flex-col border-l border-border/70 bg-background shadow-2xl"
      >
        <header className="border-b border-border/60 px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <ListTodo className="h-5 w-5" />
                <h3 id="meeting-todo-panel-title" className="text-lg font-semibold">
                  Meeting todos
                </h3>
                <Badge variant="secondary">{todos.open.length} open</Badge>
              </div>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Follow-ups from every meeting. Items become overdue after{" "}
                {MEETING_TODO_OVERDUE_GRACE_DAYS} days.
              </p>
            </div>
            <Button
              ref={closeButtonRef}
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 rounded-full"
              onClick={onClose}
              aria-label="Close meeting todos"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <section aria-labelledby="open-meeting-todos-heading">
            <div className="sticky top-0 z-10 border-b border-border/60 bg-background/95 px-5 py-3 backdrop-blur sm:px-6">
              <h4
                id="open-meeting-todos-heading"
                className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground"
              >
                Open follow-ups
              </h4>
            </div>
            {todos.open.length > 0 ? (
              todos.open.map((todo) => (
                <TodoRow
                  key={todo.action.id}
                  todo={todo}
                  canEdit={canEdit}
                  pendingActionId={pendingActionId}
                  onOpenMeeting={onOpenMeeting}
                  onSetCompleted={onSetCompleted}
                />
              ))
            ) : (
              <div className="px-6 py-12 text-center">
                <Check className="mx-auto h-8 w-8 text-emerald-600" />
                <p className="mt-3 text-sm font-medium">All caught up.</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  New meeting follow-ups will appear here.
                </p>
              </div>
            )}
          </section>

          {todos.completed.length > 0 ? (
            <section
              aria-labelledby="completed-meeting-todos-heading"
              className="border-t border-border/70"
            >
              <div className="border-b border-border/60 bg-muted/20 px-5 py-3 sm:px-6">
                <h4
                  id="completed-meeting-todos-heading"
                  className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground"
                >
                  Recently completed
                </h4>
              </div>
              {todos.completed.slice(0, 10).map((todo) => (
                <TodoRow
                  key={todo.action.id}
                  todo={todo}
                  canEdit={canEdit}
                  pendingActionId={pendingActionId}
                  onOpenMeeting={onOpenMeeting}
                  onSetCompleted={onSetCompleted}
                />
              ))}
            </section>
          ) : null}
        </div>

        {!canEdit ? (
          <footer className="border-t border-border/60 bg-muted/20 px-5 py-3 text-xs text-muted-foreground sm:px-6">
            View-only access: owners and editors can update meeting todos.
          </footer>
        ) : null}
      </aside>
    </div>
  );

  return typeof document === "undefined"
    ? content
    : createPortal(content, document.body);
}
