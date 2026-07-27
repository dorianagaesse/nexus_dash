import { unstable_noStore as noStore } from "next/cache";
import { ListTodo } from "lucide-react";

import {
  WorkspaceMeetingTodos,
  type WorkspaceMeetingTodoItem,
} from "@/components/meeting-todos/workspace-meeting-todos";
import { Badge } from "@/components/ui/badge";
import { requireVerifiedSessionUserIdFromServer } from "@/lib/auth/server-guard";
import { logServerError } from "@/lib/observability/logger";
import { listWorkspaceMeetingTodos } from "@/lib/services/workspace-meeting-todo-service";

export const dynamic = "force-dynamic";

function serializeTodo(
  todo: Awaited<ReturnType<typeof listWorkspaceMeetingTodos>>["open"][number]
): WorkspaceMeetingTodoItem {
  return {
    id: todo.id,
    content: todo.content,
    completedAt: todo.completedAt?.toISOString() ?? null,
    updatedAt: todo.updatedAt.toISOString(),
    isOverdue: todo.isOverdue,
    meeting: {
      ...todo.meeting,
      scheduledAt: todo.meeting.scheduledAt?.toISOString() ?? null,
    },
    project: todo.project,
  };
}

export default async function TodosPage() {
  noStore();
  const actorUserId = await requireVerifiedSessionUserIdFromServer();
  let initialTodos: WorkspaceMeetingTodoItem[] = [];
  let loadError: string | null = null;

  try {
    const todos = await listWorkspaceMeetingTodos({ actorUserId });
    initialTodos = [...todos.open, ...todos.completed].map(serializeTodo);
  } catch (error) {
    logServerError("TodosPage.listWorkspaceMeetingTodos", error);
    loadError = "Could not load meeting todos. Refresh to retry.";
  }

  return (
    <main className="container py-6 sm:py-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div className="space-y-4">
          <Badge variant="secondary" className="w-fit gap-1.5">
            <ListTodo className="h-3.5 w-3.5" aria-hidden />
            Workspace todos
          </Badge>
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">Todos</h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              Review meeting follow-ups across your projects without losing
              their project and meeting context.
            </p>
          </div>
        </div>

        <WorkspaceMeetingTodos
          initialTodos={initialTodos}
          loadError={loadError}
        />
      </div>
    </main>
  );
}
