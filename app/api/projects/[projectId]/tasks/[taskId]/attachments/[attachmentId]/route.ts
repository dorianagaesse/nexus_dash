import { NextRequest, NextResponse } from "next/server";

import { getSessionUserIdFromRequest } from "@/lib/auth/session-user";
import { deleteTaskAttachmentForProject } from "@/lib/services/project-attachment-service";

export async function DELETE(
  request: NextRequest,
  {
    params,
  }: {
    params: { projectId: string; taskId: string; attachmentId: string };
  }
) {
  const actorUserId = (await getSessionUserIdFromRequest(request)) ?? "";
  const { projectId, taskId, attachmentId } = params;

  if (!projectId || !taskId || !attachmentId) {
    return NextResponse.json({ error: "Missing route parameters" }, { status: 400 });
  }

  const result = await deleteTaskAttachmentForProject({
    actorUserId,
    projectId,
    taskId,
    attachmentId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true });
}
