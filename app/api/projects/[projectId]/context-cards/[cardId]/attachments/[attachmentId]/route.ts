import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedApiUser } from "@/lib/auth/api-guard";
import { deleteContextAttachmentForProject } from "@/lib/services/project-attachment-service";

export async function DELETE(
  request: NextRequest,
  {
    params,
  }: {
    params: { projectId: string; cardId: string; attachmentId: string };
  }
) {
  const authenticatedUser = await requireAuthenticatedApiUser(request);
  if (!authenticatedUser.ok) {
    return authenticatedUser.response;
  }
  const actorUserId = authenticatedUser.userId;
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
