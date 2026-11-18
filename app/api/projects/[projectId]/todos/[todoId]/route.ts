import { NextResponse, type NextRequest } from "next/server";

import { requireAuthenticatedApiUser } from "@/lib/auth/api-guard";
import {
  deleteProjectTodo,
  updateProjectTodo,
} from "@/lib/services/project-todo-service";

type Context = { params: Promise<{ projectId: string; todoId: string }> };

async function mutate(request: NextRequest, context: Context, remove: boolean) {
  const auth = await requireAuthenticatedApiUser(request);
  if (!auth.ok) return auth.response;
  const { projectId, todoId } = await context.params;
  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  const input = {
    actorUserId: auth.userId,
    projectId,
    todoId,
    revision: payload.revision,
  };
  const result = remove
    ? await deleteProjectTodo(input)
    : await updateProjectTodo({
        ...input,
        content: payload.content,
        completed: payload.completed,
      });
  if (!result.ok)
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  return NextResponse.json({ todo: result.data });
}

export async function PATCH(request: NextRequest, context: Context) {
  return mutate(request, context, false);
}
export async function DELETE(request: NextRequest, context: Context) {
  return mutate(request, context, true);
}
