"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  Circle,
  ExternalLink,
  ListTodo,
  Maximize2,
  Minimize2,
  RotateCcw,
} from "lucide-react";

import type { ProjectMeetingNotePanelNote } from "@/components/meeting-todos/meeting-note-types";
import { buildProjectMeetingTodos, type ProjectMeetingTodo } from "@/lib/meeting-todo";
import { cn } from "@/lib/utils";

interface MeetingTodoSidePanelProps {
  notes: ProjectMeetingNotePanelNote[];
  canEdit: boolean;
  referenceNowMs: number;
  pendingActionId: string | null;
  onOpenMeeting: (note: ProjectMeetingNotePanelNote) => void;
  onSetCompleted: (todo: ProjectMeetingTodo, completed: boolean) => void;
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
      <span className="inline-flex h-7 w-7 items-center justify-center text-muted-foreground">
        {isCompleted ? (
          <Check className="h-3.5 w-3.5 text-emerald-600" />
        ) : (
          <Circle className="h-3.5 w-3.5" />
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
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-wait disabled:opacity-60",
        isCompleted
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-200"
          : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
      )}
    >
      {isCompleted ? <RotateCcw className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
    </button>
  );
}

function OpenTodoItem({
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
    <li
      className={cn(
        "flex gap-2 border-b border-border/50 px-3 py-2.5 last:border-0",
        todo.isOverdue && "bg-amber-500/[0.07]"
      )}
    >
      <div className="pt-0.5">
        <TodoCompletionButton
          todo={todo}
          canEdit={canEdit}
          pendingActionId={pendingActionId}
          onSetCompleted={onSetCompleted}
        />
      </div>
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => onOpenMeeting(todo.note)}
          className="block w-full min-w-0 text-left"
        >
          <span className="line-clamp-2 text-[13px] font-medium leading-5 text-foreground">
            {todo.action.content}
          </span>
          <span className="mt-0.5 inline-flex max-w-full items-center gap-1 text-[11px] font-medium text-muted-foreground transition hover:text-foreground">
            <span className="truncate">{todo.note.title}</span>
            <ExternalLink className="h-3 w-3 shrink-0" />
          </span>
        </button>
        {todo.isOverdue ? (
          <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-200">
            <AlertTriangle className="h-3 w-3" />
            Overdue
          </span>
        ) : null}
      </div>
    </li>
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
    <li className="flex items-center gap-2 border-t border-border/50 px-3 py-2">
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
        <span className="line-clamp-1 text-[12px] font-medium text-muted-foreground line-through">
          {todo.action.content}
        </span>
        <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
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
  const todos = useMemo(
    () => buildProjectMeetingTodos(notes, referenceNowMs),
    [notes, referenceNowMs]
  );
  const [isCollapsed, setIsCollapsed] = useState(false);
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

  if (todos.open.length === 0 && todos.completed.length === 0) {
    return null;
  }

  const content = (
    <aside
      role="region"
      aria-labelledby="meeting-todo-panel-title"
      className={cn(
        "fixed right-4 top-1/2 z-[var(--layer-floating)] w-[calc(100vw-2rem)] max-w-[22rem] -translate-y-1/2 rounded-2xl border border-border/70 bg-background/95 shadow-[0_22px_70px_-34px_rgba(15,23,42,0.75)] backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:right-6",
        "print:hidden"
      )}
    >
      {isCollapsed ? (
        <button
          type="button"
          onClick={() => setIsCollapsed(false)}
          className="flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          aria-expanded={false}
          aria-controls="meeting-todo-floating-table"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <ListTodo className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0">
              <span id="meeting-todo-panel-title" className="block text-[13px] font-semibold">
                Meeting todos
              </span>
              <span className="block text-[11px] text-muted-foreground">
                {todos.open.length} open
                {overdueCount > 0 ? `, ${overdueCount} overdue` : ""}
              </span>
            </span>
          </span>
          <Maximize2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      ) : (
        <div id="meeting-todo-floating-table" className="overflow-hidden rounded-2xl">
          <header className="border-b border-border/60 px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <ListTodo className="h-3.5 w-3.5 shrink-0" />
                  <h3 id="meeting-todo-panel-title" className="truncate text-[13px] font-semibold">
                    Meeting todos
                  </h3>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                    {todos.open.length} open
                  </span>
                  {overdueCount > 0 ? (
                    <span className="shrink-0 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-200">
                      {overdueCount} overdue
                    </span>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCollapsed(true)}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                aria-label="Collapse meeting todos"
                aria-expanded={true}
                aria-controls="meeting-todo-floating-table"
              >
                <Minimize2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </header>

          <div className="max-h-[min(20rem,calc(100dvh-8rem))] overflow-y-auto">
            {todos.open.length > 0 ? (
              <ul aria-label="Open meeting todos">
                {todos.open.map((todo) => (
                  <OpenTodoItem
                    key={todo.action.id}
                    todo={todo}
                    canEdit={canEdit}
                    pendingActionId={pendingActionId}
                    onOpenMeeting={onOpenMeeting}
                    onSetCompleted={onSetCompleted}
                  />
                ))}
              </ul>
            ) : (
              <div className="px-4 py-5 text-center">
                <Check className="mx-auto h-6 w-6 text-emerald-600" />
                <p className="mt-2 text-[13px] font-medium">All caught up.</p>
              </div>
            )}

            {todos.completed.length > 0 ? (
              <section aria-label="Recently completed meeting todos" className="bg-muted/10">
                <ul>
                  {todos.completed.slice(0, 1).map((todo) => (
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
            <footer className="border-t border-border/60 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
              View-only
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
