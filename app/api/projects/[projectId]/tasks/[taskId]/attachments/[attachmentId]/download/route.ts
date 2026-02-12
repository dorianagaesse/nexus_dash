import { NextResponse } from "next/server";

import { ATTACHMENT_KIND_FILE } from "@/lib/task-attachment";
import { readAttachmentFile } from "@/lib/attachment-storage";
import { prisma } from "@/lib/prisma";

export async function GET(
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

  try {
    const attachment = await prisma.taskAttachment.findUnique({
      where: { id: attachmentId },
      select: {
        kind: true,
        name: true,
        mimeType: true,
        storageKey: true,
        task: {
          select: {
            id: true,
            projectId: true,
          },
        },
      },
    });

    if (
      !attachment ||
      attachment.task.id !== taskId ||
      attachment.task.projectId !== projectId ||
      attachment.kind !== ATTACHMENT_KIND_FILE ||
      !attachment.storageKey
    ) {
      return NextResponse.json({ error: "File attachment not found" }, { status: 404 });
    }

    const buffer = await readAttachmentFile(attachment.storageKey);
    const filename = encodeURIComponent(attachment.name || "attachment");

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": attachment.mimeType || "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (error) {
    console.error(
      "[GET /api/projects/:projectId/tasks/:taskId/attachments/:attachmentId/download]",
      error
    );
    return NextResponse.json({ error: "Failed to read attachment" }, { status: 500 });
  }
}
