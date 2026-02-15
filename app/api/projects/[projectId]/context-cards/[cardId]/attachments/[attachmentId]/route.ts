import { NextResponse } from "next/server";

import { deleteContextAttachmentForProject } from "@/lib/services/project-attachment-service";

export async function DELETE(
  _request: Request,
  {
    params,
  }: {
    params: { projectId: string; cardId: string; attachmentId: string };
  }
) {
  const { projectId, cardId, attachmentId } = params;

  if (!projectId || !cardId || !attachmentId) {
    return NextResponse.json({ error: "Missing route parameters" }, { status: 400 });
  }

  const result = await deleteContextAttachmentForProject({
    projectId,
    cardId,
    attachmentId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true });
}
