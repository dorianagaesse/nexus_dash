import type { ProjectMembershipRole } from "@prisma/client";

import {
  normalizeProjectTodoContent,
  type ProjectTodoItem,
  type ProjectTodoList,
} from "@/lib/project-todo";
import { requireProjectRole } from "@/lib/services/project-access-service";
import { withActorRlsContext, type DbClient } from "@/lib/services/rls-context";

type Failure = { ok: false; status: number; error: string };
type Result<T> = { ok: true; data: T } | Failure;
type ActorInput = { actorUserId: string; projectId: string };

// The capability field is consumed by ND-130's shared authorization contract.
// Keeping the call here also enforces the existing role ceiling before that lands.
function access(
  input: ActorInput,
  db: DbClient,
  operation: "read" | "write" | "delete"
) {
  const request = {
    ...input,
    db,
    minimumRole: (operation === "read" ? "viewer" : "editor") as ProjectMembershipRole,
    // Removing your own private item is a personal write, not a project-wide delete.
    capability: operation === "read" ? "task:read" as const : "task:write" as const,
  };
  return requireProjectRole(request);
}

const todoSelect = {
  id: true,
  content: true,
  completedAt: true,
  createdByUserId: true,
  revision: true,
} as const;
function serialize(
  todo: Omit<ProjectTodoItem, "completedAt"> & { completedAt: Date | null }
): ProjectTodoItem {
  return { ...todo, completedAt: todo.completedAt?.toISOString() ?? null };
}

export async function listProjectTodos(
  input: ActorInput
): Promise<Result<ProjectTodoList>> {
  return withActorRlsContext(input.actorUserId, async (db) => {
    const allowed = await access(input, db, "read");
    if (!allowed.ok) return allowed;
    const [write, remove, todos] = await Promise.all([
      access(input, db, "write"),
      access(input, db, "delete"),
      db.projectTodo.findMany({
        where: { projectId: input.projectId, createdByUserId: input.actorUserId },
        select: todoSelect,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      }),
    ]);
    return {
      ok: true,
      data: {
        todos: todos.map(serialize),
        canEdit: write.ok,
        canDelete: remove.ok,
      },
    };
  });
}

export async function countOpenPersonalTodos(input: ActorInput): Promise<number> {
  return withActorRlsContext(input.actorUserId, async (db) => {
    const allowed = await access(input, db, "read");
    if (!allowed.ok) return 0;
    return db.projectTodo.count({
      where: { projectId: input.projectId, createdByUserId: input.actorUserId, completedAt: null },
    });
  });
}

export async function createProjectTodo(
  input: ActorInput & { content: unknown }
): Promise<Result<ProjectTodoItem>> {
  return withActorRlsContext(input.actorUserId, async (db) => {
    const allowed = await access(input, db, "write");
    if (!allowed.ok) return allowed;
    const content = normalizeProjectTodoContent(input.content);
    if (!content)
      return { ok: false, status: 400, error: "todo-content-invalid" };
    const todo = await db.projectTodo.create({
      data: {
        projectId: input.projectId,
        createdByUserId: input.actorUserId,
        content,
      },
      select: todoSelect,
    });
    return { ok: true, data: serialize(todo) };
  });
}

export async function updateProjectTodo(
  input: ActorInput & {
    todoId: string;
    revision: unknown;
    content?: unknown;
    completed?: unknown;
  }
): Promise<Result<ProjectTodoItem>> {
  return withActorRlsContext(input.actorUserId, async (db) => {
    const allowed = await access(input, db, "write");
    if (!allowed.ok) return allowed;
    if (!Number.isSafeInteger(input.revision) || (input.revision as number) < 0)
      return { ok: false, status: 400, error: "todo-revision-required" };
    const hasContent = input.content !== undefined;
    const hasCompleted = input.completed !== undefined;
    const content = hasContent
      ? normalizeProjectTodoContent(input.content)
      : null;
    if (
      hasContent === hasCompleted ||
      (hasContent && !content) ||
      (hasCompleted && typeof input.completed !== "boolean")
    ) {
      return { ok: false, status: 400, error: "todo-update-invalid" };
    }
    const changed = await db.projectTodo.updateMany({
      where: {
        id: input.todoId,
        projectId: input.projectId,
        createdByUserId: input.actorUserId,
        revision: input.revision as number,
      },
      data: {
        ...(hasContent
          ? { content: content! }
          : { completedAt: input.completed ? new Date() : null }),
        revision: { increment: 1 },
      },
    });
    if (!changed.count)
      return { ok: false, status: 409, error: "todo-changed-or-deleted" };
    const todo = await db.projectTodo.findFirst({
      where: { id: input.todoId, projectId: input.projectId, createdByUserId: input.actorUserId },
      select: todoSelect,
    });
    if (!todo)
      return { ok: false, status: 409, error: "todo-changed-or-deleted" };
    return { ok: true, data: serialize(todo) };
  });
}

export async function deleteProjectTodo(
  input: ActorInput & { todoId: string; revision: unknown }
): Promise<Result<null>> {
  return withActorRlsContext(input.actorUserId, async (db) => {
    const allowed = await access(input, db, "delete");
    if (!allowed.ok) return allowed;
    if (!Number.isSafeInteger(input.revision) || (input.revision as number) < 0)
      return { ok: false, status: 400, error: "todo-revision-required" };
    const deleted = await db.projectTodo.deleteMany({
      where: {
        id: input.todoId,
        projectId: input.projectId,
        createdByUserId: input.actorUserId,
        revision: input.revision as number,
      },
    });
    return deleted.count
      ? { ok: true, data: null }
      : { ok: false, status: 409, error: "todo-changed-or-deleted" };
  });
}
