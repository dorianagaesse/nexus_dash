import { NextRequest, NextResponse } from "next/server";

import { logServerWarning } from "@/lib/observability/logger";
import {
  isValidReorderPayload,
  reorderProjectTasks,
} from "@/lib/services/project-task-service";

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const projectId = params.projectId;

  if (!projectId) {
    return NextResponse.json({ error: "Missing project id" }, { status: 400 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch (error) {
    logServerWarning(
      "POST /api/projects/:projectId/tasks/reorder.invalidJson",
      "Invalid JSON payload",
      { error }
    );
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  if (!isValidReorderPayload(body)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const result = await reorderProjectTasks(projectId, body);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true });
}
