"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { fetchProjectActivityMutation } from "@/lib/project-activity-client";
import {
  PROJECT_TODO_CONTENT_LIMIT,
  type ProjectTodoItem,
  type ProjectTodoList,
} from "@/lib/project-todo";

export function ProjectChecklist({
  projectId,
  actorUserId,
  initialData,
}: {
  projectId: string;
  actorUserId: string;
  initialData: ProjectTodoList;
}) {
  const [data, setData] = useState(initialData);
  const [content, setContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [completed, setCompleted] = useState(false);
  const [mine, setMine] = useState(false);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const addInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  async function refresh() {
    const response = await fetch(`/api/projects/${projectId}/todos`, {
      cache: "no-store",
    });
    if (!response.ok)
      throw new Error(
        "Could not reload the checklist. Refresh the page to retry."
      );
    setData(await response.json());
  }

  async function mutate(
    method: "POST" | "PATCH" | "DELETE",
    todo: ProjectTodoItem | null,
    values: Record<string, unknown>
  ) {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError(null);
    setFeedback("");
    try {
      const response = await fetchProjectActivityMutation(
        projectId,
        `/api/projects/${projectId}/todos${todo ? `/${todo.id}` : ""}`,
        {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...values,
            ...(todo ? { revision: todo.revision } : {}),
          }),
        }
      );
      if (response.status === 409) {
        await refresh();
        throw new Error(
          "This item changed or was deleted. The checklist is updated; review it and retry your edit."
        );
      }
      if (!response.ok)
        throw new Error(
          response.status === 403 || response.status === 404
            ? "Your access to this checklist changed. Refresh the page to check your permissions."
            : "Could not save the checklist. Your text is kept; please retry."
        );
      const result = (await response.json()) as {
        todo: ProjectTodoItem | null;
      };
      setData((current) => ({
        ...current,
        todos:
          method === "POST" && result.todo
            ? [...current.todos, result.todo]
            : method === "DELETE"
              ? current.todos.filter((item) => item.id !== todo?.id)
              : current.todos.map((item) =>
                  item.id === todo?.id && result.todo ? result.todo : item
                ),
      }));
      if (method === "POST") {
        setContent("");
        setCompleted(false);
        addInput.current?.focus();
      }
      if (method !== "POST") setEditingId(null);
      setFeedback(
        method === "DELETE"
          ? "Item deleted."
          : method === "POST"
            ? "Item added."
            : "Item updated."
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save the checklist. Please retry."
      );
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  function add(event: FormEvent) {
    event.preventDefault();
    if (content.trim()) void mutate("POST", null, { content });
  }
  const matching = data.todos.filter(
    (todo) => !mine || todo.createdByUserId === actorUserId
  );
  const visible = matching.filter(
    (todo) => Boolean(todo.completedAt) === completed
  );

  return (
    <section aria-labelledby="project-checklist-heading" className="space-y-4">
      <div className="space-y-1">
        <h2 id="project-checklist-heading" className="text-xl font-semibold">
          Checklist
        </h2>
        <p className="text-sm text-muted-foreground">
          Quick items shared with this project. No task or meeting required.
        </p>
      </div>
      {data.canEdit && (
        <form onSubmit={add} className="flex items-end gap-2">
          <div className="min-w-0 flex-1 space-y-1.5">
            <label htmlFor="checklist-new-item" className="text-sm font-medium">
              New checklist item
            </label>
            <input
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              ref={addInput}
              id="checklist-new-item"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              maxLength={PROJECT_TODO_CONTENT_LIMIT}
              placeholder="What needs doing?"
              disabled={pending}
            />
          </div>
          <Button type="submit" disabled={pending || !content.trim()}>
            Add item
          </Button>
        </form>
      )}
      {!data.canEdit && (
        <p className="text-sm text-muted-foreground">
          You have read-only access to this checklist.
        </p>
      )}
      <div
        className="flex flex-wrap items-center gap-2"
        aria-label="Checklist filters"
      >
        <Button
          size="sm"
          variant={completed ? "outline" : "secondary"}
          aria-pressed={!completed}
          onClick={() => setCompleted(false)}
        >
          Open ({matching.filter((todo) => !todo.completedAt).length})
        </Button>
        <Button
          size="sm"
          variant={completed ? "secondary" : "outline"}
          aria-pressed={completed}
          onClick={() => setCompleted(true)}
        >
          Completed ({matching.filter((todo) => todo.completedAt).length})
        </Button>
        <label className="ml-2 flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={mine}
            onChange={(event) => setMine(event.target.checked)}
          />
          Created by me
        </label>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {editingId && !data.todos.some((todo) => todo.id === editingId) && (
        <div className="space-y-2 rounded-lg border p-3">
          <label htmlFor="checklist-recovery" className="text-sm font-medium">
            Unsaved edit — this item is no longer available
          </label>
          <textarea
            id="checklist-recovery"
            className="w-full rounded-md border border-input bg-background p-2 text-sm"
            value={editContent}
            readOnly
          />
          {data.canEdit && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setContent(editContent);
                setEditingId(null);
                addInput.current?.focus();
              }}
            >
              Use text in a new item
            </Button>
          )}
        </div>
      )}
      <p role="status" className="sr-only">
        {feedback}
      </p>
      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
          {completed
            ? "No completed checklist items yet."
            : mine
              ? "No open items created by you."
              : "No open checklist items. Add a small action above to get started."}
        </p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {visible.map((todo) => (
            <li key={todo.id} className="flex items-start gap-3 p-3 sm:p-4">
              <label className="flex h-11 w-8 shrink-0 items-center justify-center">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={Boolean(todo.completedAt)}
                  disabled={pending || !data.canEdit}
                  aria-label={`${todo.completedAt ? "Reopen" : "Complete"}: ${todo.content}`}
                  onChange={(event) =>
                    void mutate("PATCH", todo, {
                      completed: event.target.checked,
                    })
                  }
                />
              </label>
              {editingId === todo.id ? (
                <form
                  className="min-w-0 flex-1 space-y-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void mutate("PATCH", todo, { content: editContent });
                  }}
                >
                  <label className="sr-only" htmlFor={`edit-${todo.id}`}>
                    Edit checklist item
                  </label>
                  <input
                    className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                    id={`edit-${todo.id}`}
                    autoFocus
                    value={editContent}
                    onChange={(event) => setEditContent(event.target.value)}
                    maxLength={PROJECT_TODO_CONTENT_LIMIT}
                    disabled={pending}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" disabled={pending || !editContent.trim()}>
                      Save item
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      type="button"
                      disabled={pending}
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <>
                  <span
                    className={`min-w-0 flex-1 py-2.5 text-sm [overflow-wrap:anywhere] ${todo.completedAt ? "text-muted-foreground line-through" : ""}`}
                  >
                    {todo.content}
                  </span>
                  <div className="flex shrink-0 gap-1">
                    {data.canEdit && (
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={pending}
                        aria-label={`Edit: ${todo.content}`}
                        onClick={() => {
                          setEditingId(todo.id);
                          setEditContent(todo.content);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    {data.canDelete && (
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={pending}
                        aria-label={`Delete: ${todo.content}`}
                        onClick={() => {
                          if (window.confirm(`Delete “${todo.content}”?`))
                            void mutate("DELETE", todo, {});
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
