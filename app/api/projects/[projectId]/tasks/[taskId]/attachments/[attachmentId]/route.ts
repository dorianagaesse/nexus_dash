import { NextResponse } from "next/server";

import { deleteTaskAttachmentForProject } from "@/lib/services/project-attachment-service";

export async function DELETE(
  _request: Request,
  {
    params,
  }: {
    params: { projectId: string; taskId: string; attachmentId: string };
  }
) {
  const { projectId, taskId, attachmentId } = params;

  if (!projectId || !taskId || !attachmentId) {
    return NextResponse.json({ error: "Missing route parameters" }, { status: 400 });
  }

  const result = await deleteTaskAttachmentForProject({
    projectId,
    taskId,
    attachmentId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true });
}
