import { NextResponse } from "next/server";

import { ATTACHMENT_KIND_FILE } from "@/lib/task-attachment";
import { readAttachmentFile } from "@/lib/attachment-storage";
import { prisma } from "@/lib/prisma";
import { RESOURCE_TYPE_CONTEXT_CARD } from "@/lib/resource-type";

export async function GET(
  request: Request,
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
    const requestUrl = new URL(request.url);
    const disposition =
      requestUrl.searchParams.get("disposition") === "inline"
        ? "inline"
        : "attachment";

    const attachment = await prisma.resourceAttachment.findUnique({
      where: { id: attachmentId },
      select: {
        kind: true,
        name: true,
        mimeType: true,
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
      attachment.resource.type !== RESOURCE_TYPE_CONTEXT_CARD ||
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
        "Content-Disposition": `${disposition}; filename*=UTF-8''${filename}`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (error) {
    console.error(
      "[GET /api/projects/:projectId/context-cards/:cardId/attachments/:attachmentId/download]",
      error
    );
    return NextResponse.json({ error: "Failed to read attachment" }, { status: 500 });
  }
}
