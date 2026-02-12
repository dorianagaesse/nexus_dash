import { NextResponse } from "next/server";

import { ATTACHMENT_KIND_FILE } from "@/lib/task-attachment";
import { deleteAttachmentFile } from "@/lib/attachment-storage";
import { prisma } from "@/lib/prisma";
import { RESOURCE_TYPE_CONTEXT_CARD } from "@/lib/resource-type";

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

  try {
    const attachment = await prisma.resourceAttachment.findUnique({
      where: { id: attachmentId },
      select: {
        id: true,
        kind: true,
        storageKey: true,
        resource: {
          select: {
            id: true,
            projectId: true,
            type: true,
          },
        },
      },
    });

    if (
      !attachment ||
      attachment.resource.id !== cardId ||
      attachment.resource.projectId !== projectId ||
      attachment.resource.type !== RESOURCE_TYPE_CONTEXT_CARD
    ) {
      return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
    }

    await prisma.resourceAttachment.delete({
      where: { id: attachment.id },
    });

    if (attachment.kind === ATTACHMENT_KIND_FILE && attachment.storageKey) {
      await deleteAttachmentFile(attachment.storageKey).catch((error) => {
        console.error(
          "[DELETE /api/projects/:projectId/context-cards/:cardId/attachments/:attachmentId] storage cleanup",
          error
        );
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(
      "[DELETE /api/projects/:projectId/context-cards/:cardId/attachments/:attachmentId]",
      error
    );
    return NextResponse.json({ error: "Failed to delete attachment" }, { status: 500 });
  }
}
