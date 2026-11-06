import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedApiUser } from "@/lib/auth/api-guard";
import { manageAgentIdentities } from "@/lib/services/agent-runtime-service";

type Context = { params: Promise<{ projectId: string }> };
export async function GET(request: NextRequest, context: Context) {
  const user = await requireAuthenticatedApiUser(request);
  if (!user.ok) return user.response;
  const { projectId } = await context.params;
  const result = await manageAgentIdentities({
    actorUserId: user.userId,
    projectId,
  });
  return NextResponse.json(result.ok ? result.data : { error: result.error }, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: NextRequest, context: Context) {
  const user = await requireAuthenticatedApiUser(request);
  if (!user.ok) return user.response;
  let command;
  try {
    command = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }
  if (!command || typeof command !== "object" || Array.isArray(command))
    return NextResponse.json({ error: "invalid-command" }, { status: 400 });
  const { projectId } = await context.params;
  const result = await manageAgentIdentities({
    actorUserId: user.userId,
    projectId,
    command,
  });
  return NextResponse.json(result.ok ? result.data : { error: result.error }, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
}
