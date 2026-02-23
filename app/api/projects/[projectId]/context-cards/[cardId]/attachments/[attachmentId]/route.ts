import { NextRequest, NextResponse } from "next/server";

import { getSessionUserIdFromRequest } from "@/lib/auth/session-user";
import { deleteContextAttachmentForProject } from "@/lib/services/project-attachment-service";

export async function DELETE(
  request: NextRequest,
  {
    params,
  }: {
    params: { projectId: string; cardId: string; attachmentId: string };
  }
) {
  const actorUserId = (await getSessionUserIdFromRequest(request)) ?? "";
  const { projectId, cardId, attachmentId } = params;

  if (!projectId || !cardId || !attachmentId) {
    return NextResponse.json({ error: "Missing route parameters" }, { status: 400 });
  }

  const result = await deleteContextAttachmentForProject({
    actorUserId,
    projectId,
    cardId,
    attachmentId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true });
}
