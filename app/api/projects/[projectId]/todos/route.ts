import { NextResponse, type NextRequest } from "next/server";

import { requireAuthenticatedApiUser } from "@/lib/auth/api-guard";
import {
  createProjectTodo,
  listProjectTodos,
} from "@/lib/services/project-todo-service";

type Context = { params: Promise<{ projectId: string }> };

export async function GET(request: NextRequest, context: Context) {
  const auth = await requireAuthenticatedApiUser(request);
  if (!auth.ok) return auth.response;
  const { projectId } = await context.params;
  const result = await listProjectTodos({
    actorUserId: auth.userId,
    projectId,
  });
  return result.ok
    ? NextResponse.json(result.data, { headers: { "Cache-Control": "no-store" } })
    : NextResponse.json({ error: result.error }, { status: result.status });
}

export async function POST(request: NextRequest, context: Context) {
  const auth = await requireAuthenticatedApiUser(request);
  if (!auth.ok) return auth.response;
  const { projectId } = await context.params;
  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  const result = await createProjectTodo({
    actorUserId: auth.userId,
    projectId,
    content: payload.content,
  });
  if (!result.ok)
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  return NextResponse.json({ todo: result.data }, { status: 201 });
}
