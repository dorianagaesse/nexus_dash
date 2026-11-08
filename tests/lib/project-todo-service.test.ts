import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  todo: {
    findMany: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
    findFirst: vi.fn(),
    deleteMany: vi.fn(),
  },
}));
vi.mock("@/lib/services/project-access-service", () => ({
  requireProjectRole: mocks.access,
}));
vi.mock("@/lib/services/rls-context", () => ({
  withActorRlsContext: (_actor: string, fn: (db: unknown) => unknown) =>
    fn({ projectTodo: mocks.todo }),
}));

import {
  createProjectTodo,
  deleteProjectTodo,
  listProjectTodos,
  updateProjectTodo,
} from "@/lib/services/project-todo-service";
import { normalizeProjectTodoContent } from "@/lib/project-todo";

const actor = { actorUserId: "user", projectId: "project" };
const todo = {
  id: "todo",
  content: "Call Sam",
  completedAt: null,
  createdByUserId: "user",
  revision: 0,
};

describe("standalone project todos", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.access.mockResolvedValue({ ok: true, role: "owner" });
    mocks.todo.findMany.mockResolvedValue([todo]);
    mocks.todo.create.mockResolvedValue(todo);
    mocks.todo.updateMany.mockResolvedValue({ count: 1 });
    mocks.todo.findFirst.mockResolvedValue({ ...todo, revision: 1 });
    mocks.todo.deleteMany.mockResolvedValue({ count: 1 });
  });

  test("lists only the authorized project and resolves operation permissions", async () => {
    mocks.access.mockImplementation(({ capability }) =>
      Promise.resolve(
        capability === "task:read"
          ? { ok: true, role: "viewer" }
          : { ok: false, status: 403, error: "forbidden" }
      )
    );
    expect(await listProjectTodos(actor)).toEqual({
      ok: true,
      data: { todos: [todo], canEdit: false, canDelete: false },
    });
    expect(mocks.todo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: "project" } })
    );
  });

  test("denies all persistence before accessing a foreign or forbidden project", async () => {
    mocks.access.mockResolvedValue({
      ok: false,
      status: 404,
      error: "project-not-found",
    });
    for (const result of [
      await listProjectTodos(actor),
      await createProjectTodo({ ...actor, content: "x" }),
      await updateProjectTodo({
        ...actor,
        todoId: "foreign",
        revision: 0,
        completed: true,
      }),
      await deleteProjectTodo({ ...actor, todoId: "foreign", revision: 0 }),
    ]) {
      expect(result).toEqual({
        ok: false,
        status: 404,
        error: "project-not-found",
      });
    }
    for (const operation of Object.values(mocks.todo))
      expect(operation).not.toHaveBeenCalled();
  });

  test.each([null, 3, {}, "", "  ", "x".repeat(501)])(
    "rejects invalid capture %j",
    async (content) => {
      expect((await createProjectTodo({ ...actor, content })).ok).toBe(false);
      expect(mocks.todo.create).not.toHaveBeenCalled();
    }
  );

  test("captures just text with authenticated creator and project", async () => {
    expect(normalizeProjectTodoContent(" x ")).toBe("x");
    expect(normalizeProjectTodoContent("x".repeat(500))).toHaveLength(500);
    await createProjectTodo({ ...actor, content: " Call Sam " });
    expect(mocks.todo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          projectId: "project",
          createdByUserId: "user",
          content: "Call Sam",
        },
      })
    );
  });

  test.each([true, false])(
    "changes completion to %s with a scoped revision predicate",
    async (completed) => {
      await updateProjectTodo({
        ...actor,
        todoId: "todo",
        revision: 3,
        completed,
      });
      expect(mocks.todo.updateMany).toHaveBeenCalledWith({
        where: { id: "todo", projectId: "project", revision: 3 },
        data: {
          completedAt: completed ? expect.any(Date) : null,
          revision: { increment: 1 },
        },
      });
    }
  );

  test("edits text without changing completion", async () => {
    await updateProjectTodo({
      ...actor,
      todoId: "todo",
      revision: 0,
      content: " Revised ",
    });
    expect(mocks.todo.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { content: "Revised", revision: { increment: 1 } },
      })
    );
  });

  test.each([
    { revision: -1, completed: true },
    { revision: "0", completed: true },
    { revision: 0 },
    { revision: 0, completed: "yes" },
    { revision: 0, content: " " },
    { revision: 0, content: "x", completed: true },
  ])("rejects malformed update %j", async (patch) => {
    expect(
      (await updateProjectTodo({ ...actor, todoId: "todo", ...patch })).ok
    ).toBe(false);
    expect(mocks.todo.updateMany).not.toHaveBeenCalled();
  });

  test("stale, removed and foreign IDs cannot overwrite or expose another row", async () => {
    mocks.todo.updateMany.mockResolvedValue({ count: 0 });
    expect(
      await updateProjectTodo({
        ...actor,
        todoId: "foreign",
        revision: 0,
        completed: true,
      })
    ).toEqual({ ok: false, status: 409, error: "todo-changed-or-deleted" });
    expect(mocks.todo.findFirst).not.toHaveBeenCalled();
  });

  test("delete requires owner, task delete capability and current revision", async () => {
    expect(
      await deleteProjectTodo({ ...actor, todoId: "todo", revision: 0 })
    ).toEqual({ ok: true, data: null });
    expect(mocks.access).toHaveBeenCalledWith(
      expect.objectContaining({
        minimumRole: "owner",
        capability: "task:delete",
      })
    );
    expect(mocks.todo.deleteMany).toHaveBeenCalledWith({
      where: { id: "todo", projectId: "project", revision: 0 },
    });
    mocks.todo.deleteMany.mockResolvedValue({ count: 0 });
    expect(
      (await deleteProjectTodo({ ...actor, todoId: "todo", revision: 0 })).ok
    ).toBe(false);
    expect(
      (await deleteProjectTodo({ ...actor, todoId: "todo", revision: null })).ok
    ).toBe(false);
  });
});
