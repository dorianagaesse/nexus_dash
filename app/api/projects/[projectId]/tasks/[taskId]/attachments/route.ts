import { NextRequest, NextResponse } from "next/server";

import { createTaskAttachmentFromForm } from "@/lib/services/project-attachment-service";

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string; taskId: string } }
) {
  const { projectId, taskId } = params;

  if (!projectId || !taskId) {
    return NextResponse.json({ error: "Missing route parameters" }, { status: 400 });
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch (error) {
    console.error("[POST /api/projects/:projectId/tasks/:taskId/attachments] invalid form", error);
    return NextResponse.json({ error: "Invalid form payload" }, { status: 400 });
  }

  const result = await createTaskAttachmentFromForm({
    projectId,
    taskId,
    formData,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ attachment: result.data });
}
