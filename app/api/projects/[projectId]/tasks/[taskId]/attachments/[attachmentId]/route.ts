import { NextResponse } from "next/server";

import { ATTACHMENT_KIND_FILE } from "@/lib/task-attachment";
import { deleteAttachmentFile } from "@/lib/attachment-storage";
import { prisma } from "@/lib/prisma";

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

  try {
    const attachment = await prisma.taskAttachment.findUnique({
      where: { id: attachmentId },
      select: {
        id: true,
        kind: true,
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
      attachment.task.projectId !== projectId
    ) {
      return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
    }

    await prisma.taskAttachment.delete({
      where: { id: attachment.id },
    });

    if (attachment.kind === ATTACHMENT_KIND_FILE && attachment.storageKey) {
      await deleteAttachmentFile(attachment.storageKey).catch((error) => {
        console.error(
          "[DELETE /api/projects/:projectId/tasks/:taskId/attachments/:attachmentId] storage cleanup",
          error
        );
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(
      "[DELETE /api/projects/:projectId/tasks/:taskId/attachments/:attachmentId]",
      error
    );
    return NextResponse.json({ error: "Failed to delete attachment" }, { status: 500 });
  }
}
