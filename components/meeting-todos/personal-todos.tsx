"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  LoaderCircle,
  LockKeyhole,
  Pencil,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  PROJECT_TODO_CONTENT_LIMIT,
  type ProjectTodoItem,
} from "@/lib/project-todo";
import { fetchProjectActivityMutation } from "@/lib/project-activity-client";
import { cn } from "@/lib/utils";

export function usePersonalTodos(
  projectId: string,
  initialTodos: ProjectTodoItem[],
  refresh: () => void
) {
  const [todos, setTodos] = useState(initialTodos);
  const [pending, setPending] = useState<string | null>(null);
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<ProjectTodoItem | null>(null);
  const [editDraft, setEditDraft] = useState("");

  useEffect(() => {
    setTodos(initialTodos);
  }, [initialTodos]);

  async function mutate(
    method: "POST" | "PATCH" | "DELETE",
    todo: ProjectTodoItem | null,
    change: Record<string, unknown>
  ) {
    if (inFlight.current) return false;
    inFlight.current = true;
    setPending(todo?.id ?? "create");
    setError(null);
    setFeedback(null);
    try {
      const response = await fetchProjectActivityMutation(
        projectId,
        `/api/projects/${projectId}/todos${todo ? `/${todo.id}` : ""}`,
        {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...change,
            ...(todo ? { revision: todo.revision } : {}),
          }),
        }
      );
      const payload = (await response.json().catch(() => null)) as {
        todo?: ProjectTodoItem;
      } | null;
      if (!response.ok) {
        if (response.status === 409) {
          setError(
            "This todo changed in another session. Your text is kept below; review the latest version before saving again."
          );
          refresh();
        } else
          setError(
            "Could not save this todo. Your text is kept. Check your access and retry."
          );
        return false;
      }
      if (method !== "DELETE" && !payload?.todo)
        throw new Error("Missing todo");
      setTodos((current) =>
        method === "POST"
          ? [...current, payload!.todo!]
          : method === "DELETE"
            ? current.filter((item) => item.id !== todo!.id)
            : current.map((item) =>
                item.id === todo!.id ? payload!.todo! : item
              )
      );
      if (method === "POST") setDraft("");
      if (method === "PATCH" && change.content !== undefined) setEditing(null);
      if (method === "DELETE" && editing?.id === todo?.id) setEditing(null);
      setFeedback(
        method === "POST"
          ? "Personal todo added. Only you can see it."
          : method === "DELETE"
            ? "Personal todo deleted."
            : change.completed === true
              ? "Todo completed."
              : change.completed === false
                ? "Todo reopened."
                : "Todo saved."
      );
      return true;
    } catch {
      setError(
        "Could not save this todo. Your text is kept. Check your connection and retry."
      );
      return false;
    } finally {
      inFlight.current = false;
      setPending(null);
    }
  }

  return {
    todos,
    pending,
    error,
    feedback,
    clearFeedback() { setFeedback(null); },
    draft,
    setDraft,
    editing,
    editDraft,
    setEditDraft,
    mutate,
    startEditing(todo: ProjectTodoItem) {
      setEditing(todo);
      setEditDraft(todo.content);
      setError(null);
    },
    cancelEditing() {
      setEditing(null);
      setError(null);
    },
    reviewLatest() {
      setEditing(todos.find((item) => item.id === editing?.id) ?? null);
    },
  };
}

type Controller = ReturnType<typeof usePersonalTodos>;

export function PersonalTodoComposer({
  controller,
  onCreated,
}: {
  controller: Controller;
  onCreated: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const focusAfterSave = useRef(false);
  useEffect(() => {
    if (!controller.pending && focusAfterSave.current) {
      focusAfterSave.current = false;
      input.current?.focus();
    }
  }, [controller.pending]);
  return (
    <form
      className="space-y-2"
      onSubmit={async (event) => {
        event.preventDefault();
        if (
          await controller.mutate("POST", null, { content: controller.draft })
        ) {
          focusAfterSave.current = true;
          onCreated();
        }
      }}
    >
      <label htmlFor="personal-todo-content" className="text-sm font-medium">
        Add a todo for yourself
      </label>
      <div className="flex items-start gap-2">
        <input
          ref={input}
          id="personal-todo-content"
          value={controller.draft}
          onChange={(event) => controller.setDraft(event.target.value)}
          maxLength={PROJECT_TODO_CONTENT_LIMIT}
          placeholder="What needs doing?"
          aria-describedby="personal-todo-privacy"
          required
          disabled={Boolean(controller.pending)}
          className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        />
        <Button
          type="submit"
          className="h-11"
          disabled={Boolean(controller.pending) || !controller.draft.trim()}
        >
          {controller.pending === "create" ? (
            <LoaderCircle
              className="h-4 w-4 animate-spin motion-reduce:animate-none"
              aria-hidden
            />
          ) : null}
          {controller.pending === "create" ? "Adding..." : "Add todo"}
        </Button>
      </div>
      <p
        id="personal-todo-privacy"
        className="flex items-center gap-1.5 text-sm text-muted-foreground"
      >
        <LockKeyhole className="h-3.5 w-3.5 shrink-0" aria-hidden /> Only you
        can see todos you add here.
      </p>
    </form>
  );
}

export function PersonalTodoEditor({
  controller,
  todo,
}: {
  controller: Controller;
  todo: ProjectTodoItem;
}) {
  const latest = controller.todos.find((item) => item.id === todo.id);
  const changed = !latest || latest.revision !== todo.revision;
  return (
    <form
      className="min-w-0 space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!changed)
          void controller.mutate("PATCH", todo, {
            content: controller.editDraft,
          });
      }}
    >
      <label htmlFor="personal-todo-edit" className="text-sm font-medium">
        Edit personal todo
      </label>
      <input
        id="personal-todo-edit"
        autoFocus
        value={controller.editDraft}
        maxLength={PROJECT_TODO_CONTENT_LIMIT}
        disabled={Boolean(controller.pending)}
        onChange={(event) => controller.setEditDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !controller.pending)
            controller.cancelEditing();
        }}
        className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
      />
      {changed && (
        <p className="text-sm text-muted-foreground">
          {latest
            ? `Latest saved text: ${latest.content}`
            : "This todo was deleted. Copy your text before closing."}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {changed ? (
          latest && (
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={controller.reviewLatest}
            >
              Use latest version
            </Button>
          )
        ) : (
          <Button
            type="submit"
            className="h-11"
            disabled={
              Boolean(controller.pending) || !controller.editDraft.trim()
            }
          >
            Save todo
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          className="h-11"
          disabled={Boolean(controller.pending)}
          onClick={controller.cancelEditing}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function PersonalTodoRow({
  todo,
  controller,
  canEdit,
  canDelete,
}: {
  todo: ProjectTodoItem;
  controller: Controller;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const completed = todo.completedAt !== null;
  const pending = controller.pending === todo.id;
  const editing = controller.editing?.id === todo.id;
  return (
    <li className="flex gap-3 border-t border-border/60 px-4 py-4 first:border-t-0 sm:px-5">
      <button
        type="button"
        disabled={!canEdit || Boolean(controller.pending) || editing}
        aria-label={`${completed ? "Reopen" : "Complete"} todo: ${todo.content}`}
        aria-busy={pending || undefined}
        onClick={() =>
          void controller.mutate("PATCH", todo, { completed: !completed })
        }
        className={cn(
          "grid h-11 w-11 shrink-0 touch-manipulation place-items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 motion-reduce:transition-none",
          completed
            ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"
            : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
        )}
      >
        {pending ? (
          <LoaderCircle
            className="h-5 w-5 animate-spin motion-reduce:animate-none"
            aria-hidden
          />
        ) : completed ? (
          <RotateCcw className="h-5 w-5" aria-hidden />
        ) : (
          <Check className="h-5 w-5" aria-hidden />
        )}
      </button>
      <div className="min-w-0 flex-1">
        {editing ? (
          <PersonalTodoEditor
            controller={controller}
            todo={controller.editing!}
          />
        ) : (
          <p
            className={cn(
              "break-words text-sm font-medium leading-6 [overflow-wrap:anywhere] sm:text-[15px]",
              completed && "text-muted-foreground line-through"
            )}
          >
            {todo.content}
          </p>
        )}
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <LockKeyhole className="h-3.5 w-3.5" aria-hidden />
          Only you
        </p>
      </div>
      {!editing && canEdit && (
        <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-11 w-11"
            aria-label={`Edit: ${todo.content}`}
            disabled={
              Boolean(controller.pending) || Boolean(controller.editing)
            }
            onClick={() => controller.startEditing(todo)}
          >
            <Pencil className="h-4 w-4" aria-hidden />
          </Button>
          {canDelete && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-11 w-11 text-muted-foreground hover:text-destructive"
              aria-label={`Delete: ${todo.content}`}
              disabled={Boolean(controller.pending)}
              onClick={() => {
                if (window.confirm("Delete this personal todo?"))
                  void controller.mutate("DELETE", todo, {});
              }}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </Button>
          )}
        </div>
      )}
    </li>
  );
}
