import { NextRequest, NextResponse } from "next/server";
import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  activity: vi.fn(),
}));
vi.mock("@/lib/auth/api-guard", () => ({
  requireAuthenticatedApiUser: mocks.auth,
}));
vi.mock("@/lib/services/project-todo-service", () => ({
  listProjectTodos: mocks.list,
  createProjectTodo: mocks.create,
  updateProjectTodo: mocks.update,
  deleteProjectTodo: mocks.remove,
}));
vi.mock("@/lib/project-activity-event-response", () => ({
  recordProjectActivityEventVersion: mocks.activity,
}));
import { GET, POST } from "@/app/api/projects/[projectId]/todos/route";
import {
  PATCH,
  DELETE,
} from "@/app/api/projects/[projectId]/todos/[todoId]/route";

const context = {
  params: Promise.resolve({ projectId: "project", todoId: "todo" }),
};
function request(method: string, body?: unknown) {
  return new NextRequest(
    "https://example.test/api/projects/project/todos/todo",
    {
      method,
      ...(body !== undefined
        ? {
            body: JSON.stringify(body),
            headers: { "Content-Type": "application/json" },
          }
        : {}),
    }
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ ok: true, userId: "actor" });
  mocks.activity.mockResolvedValue(new Date("2026-11-08T12:00:00Z"));
  for (const fn of [mocks.list, mocks.create, mocks.update, mocks.remove])
    fn.mockResolvedValue({ ok: true, data: { id: "todo" } });
});

test("all routes use session auth, including before body parsing", async () => {
  mocks.auth.mockResolvedValue({
    ok: false,
    response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
  });
  for (const [handler, method] of [
    [GET, "GET"],
    [POST, "POST"],
    [PATCH, "PATCH"],
    [DELETE, "DELETE"],
  ] as const) {
    expect((await handler(request(method), context)).status).toBe(401);
  }
  expect(mocks.list).not.toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.activity).not.toHaveBeenCalled();
});

test("routes bind service calls to the session actor and path project", async () => {
  await GET(request("GET"), context);
  expect(mocks.list).toHaveBeenCalledWith({
    actorUserId: "actor",
    projectId: "project",
  });
  expect(
    (
      await POST(
        request("POST", {
          content: "Quick action",
          actorUserId: "forged",
          projectId: "foreign",
        }),
        context
      )
    ).status
  ).toBe(201);
  expect(mocks.create).toHaveBeenCalledWith({
    actorUserId: "actor",
    projectId: "project",
    content: "Quick action",
  });
  await PATCH(request("PATCH", { revision: 2, completed: true }), context);
  expect(mocks.update).toHaveBeenCalledWith({
    actorUserId: "actor",
    projectId: "project",
    todoId: "todo",
    revision: 2,
    content: undefined,
    completed: true,
  });
  await DELETE(request("DELETE", { revision: 3 }), context);
  expect(mocks.remove).toHaveBeenCalledWith({
    actorUserId: "actor",
    projectId: "project",
    todoId: "todo",
    revision: 3,
  });
});

test.each([null, [], "bad"])("rejects non-object JSON %j", async (body) => {
  for (const [handler, method] of [
    [POST, "POST"],
    [PATCH, "PATCH"],
    [DELETE, "DELETE"],
  ] as const)
    expect((await handler(request(method, body), context)).status).toBe(400);
  expect(mocks.create).not.toHaveBeenCalled();
});

test("service denials and conflicts propagate without emitting activity", async () => {
  mocks.update.mockResolvedValue({
    ok: false,
    status: 409,
    error: "todo-changed-or-deleted",
  });
  const response = await PATCH(
    request("PATCH", { revision: 0, completed: true }),
    context
  );
  expect(response.status).toBe(409);
  expect(mocks.activity).not.toHaveBeenCalled();
});
