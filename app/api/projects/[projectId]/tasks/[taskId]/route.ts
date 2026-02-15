import { NextRequest, NextResponse } from "next/server";

import {
  type UpdateTaskPayload,
  updateTaskForProject,
} from "@/lib/services/project-task-service";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { projectId: string; taskId: string } }
) {
  const { projectId, taskId } = params;

  if (!projectId || !taskId) {
    return NextResponse.json({ error: "Missing route parameters" }, { status: 400 });
  }

  let payload: UpdateTaskPayload;

  try {
    payload = (await request.json()) as UpdateTaskPayload;
  } catch (error) {
    console.error("[PATCH /api/projects/:projectId/tasks/:taskId] invalid json", error);
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const result = await updateTaskForProject(projectId, taskId, payload);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ task: result.data.task });
}
